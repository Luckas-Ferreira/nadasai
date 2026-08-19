import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { saveBlob } from '../../core/image/download';
import { extForMime, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { toMessageKey } from '../../core/errors';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { CompareSliderComponent } from '../../shared/ui/compare-slider.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { PreviewSurfaceComponent } from '../../shared/ui/preview-surface.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { ScaleFactor, SharpnessLevel, UpscaleResult, UpscaleService } from './services/upscale.service';

@Component({
  selector: 'app-upscale',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    DecimalPipe,
    FormsModule,
    ToolPageComponent,
    DropzoneComponent,
    PreviewSurfaceComponent,
    CompareSliderComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
  ],
  templateUrl: './upscale.component.html',
})
export class UpscaleComponent {
  private readonly urls = inject(ObjectUrlScope);
  protected readonly tool = toolById('upscale');
  private readonly upscaler = inject(UpscaleService);
  private readonly pendingTransition = inject(PendingTransitionService);

  protected readonly state = inject(WorkspaceService);
  protected readonly i18n = inject(TranslationService);

  protected readonly sourceUrl = signal<string | null>(null);
  protected readonly result = signal<UpscaleResult | null>(null);
  protected readonly resultUrl = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly progress = signal(0);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly scale = signal<ScaleFactor>(2);
  protected readonly sharpness = signal<SharpnessLevel>('balanced');
  protected readonly denoise = signal<boolean>(true);
  protected readonly aiStrength = signal<number>(1.4);

  private readonly ranScale = signal<ScaleFactor | null>(null);
  private readonly ranSharpness = signal<SharpnessLevel | null>(null);
  private readonly ranDenoise = signal<boolean | null>(null);
  private readonly ranAiStrength = signal<number | null>(null);

  protected readonly stale = computed(
    () =>
      !this.result() ||
      this.ranScale() !== this.scale() ||
      this.ranSharpness() !== this.sharpness() ||
      this.ranDenoise() !== this.denoise() ||
      this.ranAiStrength() !== this.aiStrength(),
  );

  /**
   * A porta de hidratação. `currentFile()` devolve a sessão seja ela qual for —
   * e desde que a sessão é uma só, ela pode estar segurando um PDF (img-to-pdf)
   * ou um vídeo. `fileFor` só entrega quando o `accepts` da ferramenta cobre o
   * tipo, que é a mesma garantia que o serviço antigo dava recusando o `apply`,
   * só que do lado certo: quem não abre o arquivo é quem tem de recusá-lo.
   *
   * Sendo um `computed` sobre a sessão, ele também reage ao desfazer — que é o
   * que permitiu tirar o `navigate(['/'])` da barra de arquivo.
   */
  protected readonly sourceFile = computed(() => this.state.fileFor('upscale'));

  protected readonly originalDimensions = computed(() => {
    const res = this.result();
    return res ? `${res.originalWidth} × ${res.originalHeight} px` : '—';
  });

  protected readonly newDimensions = computed(() => {
    const res = this.result();
    return res ? `${res.newWidth} × ${res.newHeight} px` : '—';
  });

  constructor() {
    hydrateFromWorkspace('upscale', (file) => this.hydrate(file));
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);
    try {
      this.state.load(file, 'upscale');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private hydrate(file: File | null): void {
    this.clearResult();

    if (!file) {
      this.urls.revoke(this.sourceUrl());
      this.sourceUrl.set(null);
      return;
    }

    this.sourceUrl.set(this.urls.replace(this.sourceUrl(), file));
    void this.autoRun();
  }

  /**
   * Executa automaticamente apenas na primeira vez que uma imagem entra na ferramenta.
   * Se 'upscale' já consta no histórico da sessão, significa que a imagem já foi melhorada,
   * portanto não deve executar novamente ao voltar para a ferramenta.
   */
  private async autoRun(): Promise<void> {
    if (this.state.history().includes('upscale')) return;
    await this.runUpscale();
  }

  protected async runUpscale(): Promise<void> {
    const file = this.sourceFile();
    if (!file || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    const scale = this.scale();
    const sharpness = this.sharpness();
    const denoise = this.denoise();
    const aiStrength = this.aiStrength();

    try {
      const res = await this.upscaler.upscaleImage(
        file,
        {
          scale,
          sharpness,
          denoise,
          aiStrength,
        },
        (pct) => this.progress.set(pct)
      );
      this.result.set(res);
      this.resultUrl.set(res.dataUrl);
      this.ranScale.set(scale);
      this.ranSharpness.set(sharpness);
      this.ranDenoise.set(denoise);
      this.ranAiStrength.set(aiStrength);

      // `registerResult` (que chama `apply`), não `load`.
      const session = this.state.session();
      if (session) {
        this.pendingTransition.registerResult(
          'upscale',
          res.blob,
          this.tool.suffix,
          extForMime(session.file.type) || 'png',
        );
      }
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    const session = this.state.session();
    const res = this.result();
    if (!session || !res) return;

    const ext = extForMime(session.file.type) || 'png';
    saveBlob(res.blob, suffixedName(session.originalName, this.tool.suffix, ext));
  }

  protected reset(): void {
    this.urls.releaseAll();
    this.sourceUrl.set(null);
    this.clearResult();
    this.errorKey.set(null);
    this.progress.set(0);
    this.state.clear();
  }

  private clearResult(): void {
    this.urls.revoke(this.resultUrl());
    this.result.set(null);
    this.resultUrl.set(null);
    this.ranScale.set(null);
    this.ranSharpness.set(null);
    this.ranDenoise.set(null);
    this.ranAiStrength.set(null);
    this.pendingTransition.clear();
  }
}
