import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { toolById } from '../../core/tools/tools';
import { MODE_PRESETS, type VectorMode, suggestMode } from '../../core/vector/vectorize';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { CompareSliderComponent } from '../../shared/ui/compare-slider.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { PreviewSurfaceComponent } from '../../shared/ui/preview-surface.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { VectorizerService } from './services/vectorizer.service';

/**
 * Imagem -> SVG.
 *
 * FORA DA CADEIA DO WorkspaceService, e isso não é esquecimento. A saída é SVG,
 * não `image/*`, então `apply()` recusaria — e recusa com razão: o próximo tool
 * da cadeia reencoda por canvas, o que rasteriza de volta exatamente o vetor que
 * esta ferramenta acabou de produzir. Mesmo argumento que já isola `remove-exif`
 * (cujo strip lossless seria desfeito) e `img-to-pdf` (cuja saída é terminal).
 *
 * Como não há cadeia, o arquivo é estado local e `<app-tool-page>` recebe
 * `[forceLoaded]` — o padrão dele observa a cadeia, que aqui está sempre vazia.
 */
@Component({
  selector: 'app-vectorize',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    FormsModule,
    ToolPageComponent,
    DropzoneComponent,
    PreviewSurfaceComponent,
    CompareSliderComponent,
    PanelComponent,
    SegmentedComponent,
    ActionBarComponent,
    AlertComponent,
  ],
  templateUrl: './vectorize.component.html',
})
export class VectorizeComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly vectorizer = inject(VectorizerService);
  private readonly tool = toolById('vectorize');
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);

  constructor() {
    hydrateFromWorkspace('vectorize', (file) => void this.openFile(file));
  }

  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  protected readonly sourceUrl = signal<string | null>(null);
  protected readonly resultSvg = signal<string | null>(null);
  protected readonly resultUrl = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly progress = signal(0);

  protected readonly mode = signal<VectorMode>('logo');
  /** Ajuste fino sobre o preset do modo. */
  protected readonly detail = signal(50);

  protected readonly stats = signal<{
    shapes: number;
    nodes: number;
    colors: number;
    gradients: number;
    bytes: number;
  } | null>(null);

  /** O que a imagem sugere. Mostrado como dica quando difere do escolhido —
   *  trocar sozinho depois que a pessoa escolheu seria roubar o controle. */
  protected readonly suggested = signal<VectorMode | null>(null);

  private readonly ranMode = signal<VectorMode | null>(null);
  private readonly ranDetail = signal<number | null>(null);

  /**
   * O botão volta assim que um ajuste muda o que `run()` leria.
   *
   * Sem isto, apertar de novo gastaria segundos de CPU para reproduzir byte a
   * byte o SVG que já está na tela — que é o modo de falha que `app-action-bar`
   * existe para evitar, e que numa ferramenta lenta é ainda mais caro que nos
   * outros tools.
   */
  protected readonly stale = computed(
    () => this.ranMode() !== this.mode() || this.ranDetail() !== this.detail(),
  );

  /**
   * As opções montadas AQUI e não no template, tipadas em `VectorMode`.
   *
   * Um literal inline no template faz o Angular inferir `SegmentOption<string>`,
   * e aí `(valueChange)` entrega `string` para um `signal<VectorMode>` — que sob
   * `strictTemplates` é erro de compilação, e sem ele seria um bug silencioso no
   * dia em que alguém escrevesse um modo que não existe.
   */
  protected readonly modeOptions = computed<readonly SegmentOption<VectorMode>[]>(() => {
    const d = this.i18n.t();
    return [
      { value: 'trace', label: d['vector.mode.trace'] },
      { value: 'logo', label: d['vector.mode.logo'] },
      { value: 'illustration', label: d['vector.mode.illustration'] },
      { value: 'pixel', label: d['vector.mode.pixel'] },
    ];
  });

  /**
   * Chave da descrição do modo.
   *
   * Montada como computed e não interpolada no template porque
   * `noPropertyAccessFromIndexSignature` recusa indexar o dicionário com uma
   * string construída — e com razão: `'vector.mode.' + x + '_desc'` não é
   * verificável, então um modo novo sem descrição renderizaria vazio em vez de
   * quebrar o build. O `as` fica confinado a esta linha, onde as quatro chaves
   * possíveis estão logo ali no dicionário.
   */
  protected readonly modeDescKey = computed<TranslationKey>(
    () => `vector.mode.${this.mode()}_desc` as TranslationKey,
  );

  protected readonly originalSize = computed(() => {
    const f = this.file();
    return f ? formatBytes(f.size) : '—';
  });

  protected readonly svgSize = computed(() => {
    const s = this.stats();
    return s ? formatBytes(s.bytes) : '—';
  });

  /** Null quando o SVG ficou maior — acontece em foto, e é honesto dizer. */
  protected readonly savings = computed(() => {
    const original = this.file()?.size;
    const bytes = this.stats()?.bytes;
    if (!original || !bytes) return null;
    const saved = ((original - bytes) / original) * 100;
    return saved > 0 ? `${saved.toFixed(0)}%` : null;
  });

  protected readonly modeHintKey = computed<TranslationKey | null>(() => {
    const s = this.suggested();
    if (!s || s === this.mode()) return null;
    return `vector.suggest.${s}` as TranslationKey;
  });

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'vectorize');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private async openFile(file: File | null): Promise<void> {
    this.errorKey.set(null);
    this.clearResult();
    this.pendingTransition.clear();

    if (!file) {
      this.file.set(null);
      this.urls.revoke(this.sourceUrl());
      this.sourceUrl.set(null);
      return;
    }

    this.file.set(file);
    this.sourceUrl.set(this.urls.replace(this.sourceUrl(), file));

    // O modo sugerido sai de uma amostragem barata do próprio raster, no mesmo
    // espírito de `isFlatGraphic()` na remoção de fundo: medir a entrada em vez
    // de perguntar antes de a pessoa ter visto qualquer resultado.
    try {
      const { rgba, width, height } = await this.vectorizer.sourcePixels(file);
      const guess = suggestMode(rgba, width, height);
      this.suggested.set(guess);
      this.mode.set(guess);
    } catch {
      // Sugerir é conveniência. Falhar aqui não impede vetorizar, e mostrar erro
      // por não ter conseguido adivinhar seria ruído.
      this.suggested.set(null);
    }
  }

  protected async run(): Promise<void> {
    const file = this.file();
    if (!file) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    const mode = this.mode();
    const detail = this.detail();

    try {
      const { rgba, width, height } = await this.vectorizer.sourcePixels(file);

      const out = await this.vectorizer.run(
        rgba,
        width,
        height,
        this.optionsFor(mode, detail),
        (_stage, fraction) => this.progress.set(fraction),
      );

      this.resultSvg.set(out.svg);
      this.resultUrl.set(
        this.urls.replace(this.resultUrl(), new Blob([out.svg], { type: 'image/svg+xml' })),
      );
      this.stats.set({
        shapes: out.shapeCount,
        nodes: out.nodeCount,
        colors: out.colorCount,
        gradients: out.gradientCount,
        bytes: out.byteLength,
      });
      this.ranMode.set(mode);
      this.ranDetail.set(detail);

      // O SVG entra na sessão como `kind: 'svg'`, e é por isso que `kindOf` testa
      // `image/svg+xml` ANTES do prefixo `image/`: classificado como raster, o
      // vetor recém-criado seria oferecido ao cortar, que o decodifica num canvas
      // e joga fora exatamente o que esta ferramenta acabou de produzir.
      this.pendingTransition.registerResult(
        'vectorize',
        new Blob([out.svg], { type: 'image/svg+xml' }),
        this.tool.suffix,
        'svg',
      );
    } catch (err) {
      console.error('Vectorize failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
      this.progress.set(0);
    }
  }

  /**
   * O preset do modo, com o slider de detalhe deslocando os dois parâmetros que
   * de fato trocam nitidez por tamanho de arquivo.
   *
   * Um slider só, e não seis campos. Expor `maxColors`, `minArea`, `smoothness`,
   * `cornerThreshold`, raio e epsilon separadamente é o que faz todo vetorizador
   * online parecer um painel de engenharia e produzir um primeiro resultado
   * ruim: ninguém sabe o que "epsilon 60" faz com o próprio logo. O modo escolhe
   * o regime; o slider anda dentro dele.
   */
  private optionsFor(mode: VectorMode, detail: number) {
    const preset = MODE_PRESETS[mode];

    // 0..100 -> 1.55x..0.7x sobre a tolerância. Mais detalhe = tolerância menor
    // = mais nós e mais fidelidade.
    //
    // A faixa mudou de lugar junto com os presets (1,1-1,6 -> 0,45-0,7) quando
    // `refine.ts` passou a entregar o contorno em sub-pixel. O piso de ~1 px que
    // justificava a faixa antiga era a escada do reticulado, e ela não chega
    // mais até aqui; o piso de agora é o ruído da leitura de cobertura, uma
    // ordem de grandeza abaixo. O que NÃO mudou é o motivo de a faixa ser
    // limitada dos dois lados: abaixo do ruído, o ajuste gasta nós para
    // reproduzir erro de medida, e isso parece "mais detalhe" enquanto piora o
    // desenho. Com os presets atuais, tudo fica entre ~0,32 e ~1,1 px.
    const t = detail / 100;
    const smoothScale = 1.55 - 0.85 * t;
    // E mais cores, porque em arte plana o que limita fidelidade é a paleta.
    const colorScale = 0.6 + 0.8 * t;

    return {
      ...preset,
      smoothness: Math.max(0.01, preset.smoothness * smoothScale),
      maxColors: Math.max(2, Math.round(preset.maxColors * colorScale)),
    };
  }

  protected download(): void {
    const svg = this.resultSvg();
    const file = this.file();
    if (!svg || !file) return;

    saveBlob(new Blob([svg], { type: 'image/svg+xml' }), suffixedName(file.name, this.tool.suffix, 'svg'));
  }

  protected reset(): void {
    this.pendingTransition.clear();
    this.workspace.clear();
    this.vectorizer.cancel();
    this.urls.releaseAll();
    this.file.set(null);
    this.sourceUrl.set(null);
    this.suggested.set(null);
    this.clearResult();
    this.errorKey.set(null);
  }

  private clearResult(): void {
    this.urls.revoke(this.resultUrl());
    this.resultSvg.set(null);
    this.resultUrl.set(null);
    this.stats.set(null);
    this.ranMode.set(null);
    this.ranDetail.set(null);
  }
}
