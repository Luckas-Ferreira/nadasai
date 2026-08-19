import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { closePdf, openPdf, releaseCanvas, renderPageToCanvas } from '../../core/pdf/pdfjs';
import {
  rotatePoint,
  textBlock,
  watermarkPlacements,
  type MarkSize,
  type WatermarkLayout,
  type WatermarkPosition,
} from '../../core/pdf/watermark-layout';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { PdfPasswordPromptComponent } from '../../shared/ui/pdf-password-prompt.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { PdfWatermarkService, type WatermarkMark } from './services/pdf-watermark.service';

/** Largura do raster da página 1 que serve de fundo da prévia. */
const PREVIEW_WIDTH = 520;

/** A margem da folha, igual à do serviço: a prévia tem que placear no mesmo lugar. */
const MARGIN_PT = 28;

type MarkKind = 'text' | 'image';

const COLOURS = ['#ef4444', '#64748b', '#3b82f6', '#000000'] as const;

@Component({
  selector: 'app-watermark-pdf',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    AlertComponent,
    IconComponent,
    SegmentedComponent,
    ActionBarComponent,
    ButtonDirective,
    PdfPasswordPromptComponent,
  ],
  templateUrl: './watermark-pdf.component.html',
})
export class WatermarkPdfComponent {
  protected readonly Math = Math;
  protected readonly colours = COLOURS;

  private readonly watermarkService = inject(PdfWatermarkService);
  private readonly urls = inject(ObjectUrlScope);
  protected readonly tool = toolById('watermark-pdf');
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly i18n = inject(TranslationService);

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('preview');

  // ------------------------------------------------------------ documento
  protected readonly file = signal<File | null>(null);
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly pdfProtected = signal(false);
  protected readonly pdfPassword = signal<string | null>(null);
  protected readonly passwordError = signal<string | null>(null);
  protected readonly pageCount = signal(0);
  protected readonly renderingPreview = signal(false);

  /** A página 1 rasterizada, guardada para a prévia repintar sem reabrir o PDF. */
  private readonly pageRaster = signal<HTMLCanvasElement | null>(null);
  /** Tamanho da página em PONTOS: a prévia desenha na escala do PDF, não do raster. */
  private readonly pagePoints = signal<MarkSize>({ width: 0, height: 0 });

  // ------------------------------------------------------------ a marca
  protected readonly kind = signal<MarkKind>('text');
  protected readonly text = signal('CONFIDENCIAL');
  protected readonly fontSize = signal(48);
  protected readonly bold = signal(true);
  protected readonly colorHex = signal<string>(COLOURS[0]);

  protected readonly logo = signal<File | null>(null);
  protected readonly logoUrl = signal<string | null>(null);
  private readonly logoImage = signal<HTMLImageElement | null>(null);
  protected readonly logoWidthPercent = signal(30);

  // ------------------------------------------------------------ o arranjo
  protected readonly layout = signal<WatermarkLayout>('tiled');
  protected readonly position = signal<WatermarkPosition>('center');
  protected readonly opacity = signal(0.3);
  protected readonly rotationDegrees = signal(-45);
  protected readonly gapPercent = signal(60);

  // ------------------------------------------------------------ execução
  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly marksPerPage = signal(0);
  protected readonly spacingClamped = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  constructor() {
    // A sessão é a fonte: um PDF que veio de img-to-pdf, de outra ferramenta de
    // PDF ou de um desfazer chega por aqui exatamente como o que a pessoa soltou
    // no dropzone. A senha vem junto — antes cada ferramenta guardava a sua, e
    // encadear três num arquivo protegido pedia a mesma senha três vezes.
    hydrateFromWorkspace('watermark-pdf', (file) =>
      void this.openFile(file, this.workspace.pdfPassword() ?? undefined),
    );

    // A prévia É a ferramenta: repinta a cada ajuste com a MESMA conta que o
    // serviço usa para escrever no PDF. O que existia antes era um `<span>` com
    // `rotate()` no meio da página, que não sabia de repetição, de posição nem de
    // logo — ou seja, escondia o resultado até o download.
    effect(() => this.paintPreview());
  }

  // ------------------------------------------------------------ derivados
  protected readonly kindOptions = computed<SegmentOption<MarkKind>[]>(() => [
    { value: 'text', label: this.i18n.t()['wmpdf.kind_text'] },
    { value: 'image', label: this.i18n.t()['wmpdf.kind_image'] },
  ]);

  protected readonly layoutOptions = computed<SegmentOption<WatermarkLayout>[]>(() => [
    { value: 'tiled', label: this.i18n.t()['wmpdf.layout_tiled'] },
    { value: 'single', label: this.i18n.t()['wmpdf.layout_single'] },
  ]);

  protected readonly positions: readonly WatermarkPosition[] = [
    'top-left',
    'top',
    'top-right',
    'left',
    'center',
    'right',
    'bottom-left',
    'bottom',
    'bottom-right',
  ];


  /**
   * O rótulo de cada ponto, por um mapa TIPADO.
   *
   * Montar a chave concatenando (`'wmpdf.pos_' + spot`) parece mais curto e não
   * compila: `t()` é indexado por `TranslationKey`, e é justamente essa tipagem
   * que faz uma chave faltando virar erro de compilação em vez de um rótulo
   * vazio na tela.
   */
  private readonly positionKeys: Record<WatermarkPosition, TranslationKey> = {
    'top-left': 'wmpdf.pos_top-left',
    top: 'wmpdf.pos_top',
    'top-right': 'wmpdf.pos_top-right',
    left: 'wmpdf.pos_left',
    center: 'wmpdf.pos_center',
    right: 'wmpdf.pos_right',
    'bottom-left': 'wmpdf.pos_bottom-left',
    bottom: 'wmpdf.pos_bottom',
    'bottom-right': 'wmpdf.pos_bottom-right',
  };

  protected positionLabel(spot: WatermarkPosition): string {
    return this.i18n.t()[this.positionKeys[spot]];
  }

  protected readonly originalSize = computed(() => {
    const f = this.file();
    return f ? formatBytes(f.size) : null;
  });

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : null;
  });

  /** Texto sem linhas vazias — é o que vira marca, e o que o botão exige. */
  protected readonly lines = computed(() =>
    this.text()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );

  protected readonly canRun = computed(() =>
    this.kind() === 'text' ? this.lines().length > 0 : !!this.logo(),
  );

  /**
   * Tudo o que o `run()` lê, serializado.
   *
   * Um botão que recalcula bytes idênticos lê como "não funcionou". O que estava
   * aqui era o erro espelhado e pior: `stale` era `!resultBlob()`, então depois
   * de aplicar uma vez, trocar o texto, a cor ou o ângulo não reoferecia o botão
   * — a única saída era recarregar a página.
   */
  private readonly signature = computed(() =>
    JSON.stringify([
      this.kind(),
      this.kind() === 'text'
        ? [this.lines(), this.fontSize(), this.bold(), this.colorHex()]
        : [this.logo()?.name, this.logo()?.size, this.logoWidthPercent()],
      this.layout(),
      this.position(),
      this.opacity(),
      this.rotationDegrees(),
      this.gapPercent(),
    ]),
  );

  private readonly ranSignature = signal<string | null>(null);

  protected readonly stale = computed(() => this.signature() !== this.ranSignature());

  // ------------------------------------------------------------ entrada
  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'watermark-pdf');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  /** A senha do prompt: guardada na sessão, para o resto da cadeia não repetir. */
  protected onUnlock(password: string): void {
    this.workspace.setPdfPassword(password);
    void this.openFile(this.pendingFile(), password);
  }

  /**
   * O logo entra decodificado, não só como arquivo.
   *
   * A prévia precisa de um `HTMLImageElement` para desenhar e o tamanho da marca
   * sai da proporção da imagem; decodificar uma vez aqui serve aos dois e é o que
   * faz o logo na tela ter o mesmo tamanho que o do PDF.
   */
  protected async onLogo(file: File): Promise<void> {
    this.errorKey.set(null);

    try {
      const url = this.urls.replace(this.logoUrl(), file);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('decode'));
        img.src = url;
      });

      this.logo.set(file);
      this.logoUrl.set(url);
      this.logoImage.set(img);
    } catch {
      this.errorKey.set('error.decode_failed');
    }
  }

  private async openFile(file: File | null, password?: string): Promise<void> {
    if (!file) {
      this.reset();
      return;
    }

    this.errorKey.set(null);
    this.resultBlob.set(null);
    this.ranSignature.set(null);
    this.passwordError.set(null);
    this.pendingFile.set(file);

    try {
      const doc = await openPdf(file, password);
      try {
        this.pageCount.set(doc.numPages);
        this.file.set(file);
        this.pdfPassword.set(password ?? null);
        this.pdfProtected.set(false);

        await this.loadPreview(doc);
      } finally {
        await closePdf(doc);
      }
    } catch (err) {
      console.error('[WatermarkPdf] Error loading PDF:', err);
      const msgKey = toMessageKey(err);
      if (msgKey === 'error.pdf_encrypted') {
        this.pdfProtected.set(true);
        if (password) this.passwordError.set(this.i18n.t()['pdf.wrong_password']);
      } else {
        this.errorKey.set(msgKey);
        this.file.set(null);
      }
    }
  }

  private async loadPreview(doc: Awaited<ReturnType<typeof openPdf>>): Promise<void> {
    this.renderingPreview.set(true);
    try {
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: 1 });

      const previous = this.pageRaster();
      if (previous) releaseCanvas(previous);

      this.pagePoints.set({ width: viewport.width, height: viewport.height });
      this.pageRaster.set(await renderPageToCanvas(doc, 1, PREVIEW_WIDTH / viewport.width));
    } catch (err) {
      console.error('[WatermarkPdf] Error rendering preview:', err);
    } finally {
      this.renderingPreview.set(false);
    }
  }

  // ------------------------------------------------------------ prévia
  /**
   * Pinta a página e as marcas por cima, na geometria exata do resultado.
   *
   * Toda a conta é feita em PONTOS e só o `setTransform` converte para pixels.
   * Espalhar a conversão pelos cálculos é como a prévia antiga passou a mentir
   * sobre o tamanho — ela multiplicava o corpo por 0,75 e torcia.
   */
  private paintPreview(): void {
    const target = this.canvas()?.nativeElement;
    const raster = this.pageRaster();
    const points = this.pagePoints();
    if (!target || !raster || points.width === 0) return;

    // Lidos aqui para o efeito re-executar a cada ajuste do painel.
    const kind = this.kind();
    const lines = this.lines();
    const fontSize = this.fontSize();
    const bold = this.bold();
    const colour = this.colorHex();
    const logo = this.logoImage();
    const logoWidth = this.logoWidthPercent();
    const layout = this.layout();
    const position = this.position();
    const opacity = this.opacity();
    const rotation = this.rotationDegrees();
    const gap = this.gapPercent();

    target.width = raster.width;
    target.height = raster.height;

    const ctx = target.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(raster, 0, 0);

    const scale = target.width / points.width;
    // O canvas tem o y para baixo e o PDF para cima. A inversão fica aqui, uma
    // vez só, e daqui para dentro tudo é coordenada de PDF.
    ctx.setTransform(scale, 0, 0, -scale, 0, target.height);
    ctx.globalAlpha = opacity;
    ctx.font = `${bold ? 'bold ' : ''}${fontSize}px Helvetica, Arial, sans-serif`;

    const block =
      kind === 'text' && lines.length > 0
        ? textBlock(
            lines.map((line) => ctx.measureText(line).width),
            fontSize,
          )
        : null;

    const logoSize: MarkSize | null = logo
      ? {
          width: (points.width * logoWidth) / 100,
          height: ((points.width * logoWidth) / 100) * (logo.height / logo.width),
        }
      : null;

    const size = kind === 'text' ? block?.size ?? null : logoSize;

    if (!size) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      return;
    }

    const placed = watermarkPlacements({
      pageWidth: points.width,
      pageHeight: points.height,
      mark: size,
      layout,
      position,
      rotationDegrees: rotation,
      gapPercent: gap,
      marginPt: MARGIN_PT,
    });

    const rad = (rotation * Math.PI) / 180;

    for (const origin of placed.placements) {
      if (kind === 'text' && block) {
        ctx.fillStyle = colour;
        for (let l = 0; l < lines.length; l++) {
          const at = rotatePoint(origin, block.lines[l], rotation);
          ctx.save();
          ctx.translate(at.x, at.y);
          ctx.rotate(rad);
          // Só o desenho desinverte o y. Sem este `scale`, o texto herda o flip
          // da página e sai espelhado de cabeça para baixo.
          ctx.scale(1, -1);
          ctx.fillText(lines[l], 0, 0);
          ctx.restore();
        }
      } else if (logo && logoSize) {
        ctx.save();
        ctx.translate(origin.x, origin.y);
        ctx.rotate(rad);
        ctx.scale(1, -1);
        ctx.drawImage(logo, 0, -logoSize.height, logoSize.width, logoSize.height);
        ctx.restore();
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ aplicar
  protected async run(): Promise<void> {
    const f = this.file();
    if (!f || !this.canRun() || this.busy()) return;

    const logo = this.logo();
    const mark: WatermarkMark | null =
      this.kind() === 'text'
        ? {
            kind: 'text',
            text: this.text(),
            fontSize: this.fontSize(),
            colorHex: this.colorHex(),
            bold: this.bold(),
          }
        : logo
          ? { kind: 'image', file: logo, widthPercent: this.logoWidthPercent() }
          : null;

    if (!mark) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    try {
      const result = await this.watermarkService.applyWatermark({
        file: f,
        password: this.pdfPassword() ?? undefined,
        mark,
        layout: this.layout(),
        position: this.position(),
        opacity: this.opacity(),
        rotationDegrees: this.rotationDegrees(),
        gapPercent: this.gapPercent(),
        onProgress: (p) => this.progress.set(p),
      });

      this.resultBlob.set(result.blob);
      this.marksPerPage.set(result.marksPerPage);
      this.spacingClamped.set(result.spacingClamped);
      this.ranSignature.set(this.signature());
      this.pendingTransition.registerResult('watermark-pdf', result.blob, this.tool.suffix, 'pdf');
    } catch (err) {
      console.error('[WatermarkPdf] Apply watermark failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
      this.progress.set(null);
    }
  }

  protected download(): void {
    const blob = this.resultBlob();
    const f = this.file();
    if (!blob || !f) return;

    saveBlob(blob, suffixedName(f.name, this.tool.suffix, 'pdf'));
  }

  protected reset(): void {
    this.pendingTransition.clear();
    this.workspace.clear();

    const raster = this.pageRaster();
    if (raster) releaseCanvas(raster);
    this.pageRaster.set(null);

    this.urls.releaseAll();
    this.file.set(null);
    this.pendingFile.set(null);
    this.pdfProtected.set(false);
    this.pdfPassword.set(null);
    this.passwordError.set(null);
    this.pageCount.set(0);
    this.logo.set(null);
    this.logoUrl.set(null);
    this.logoImage.set(null);
    this.resultBlob.set(null);
    this.ranSignature.set(null);
    this.marksPerPage.set(0);
    this.spacingClamped.set(false);
    this.errorKey.set(null);
  }
}
