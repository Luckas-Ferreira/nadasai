import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
  private readonly router = inject(Router);
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
    this.result.set(null);
    this.resultUrl.set(null);
    this.pendingTransition.clear();

    if (!file) {
      this.urls.revoke(this.sourceUrl());
      this.sourceUrl.set(null);
      return;
    }

    this.sourceUrl.set(this.urls.replace(this.sourceUrl(), file));
    void this.runUpscale();
  }

  protected async runUpscale(): Promise<void> {
    const file = this.sourceFile();
    if (!file || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    try {
      const res = await this.upscaler.upscaleImage(
        file,
        {
          scale: this.scale(),
          sharpness: this.sharpness(),
          denoise: this.denoise(),
          aiStrength: this.aiStrength(),
        },
        (pct) => this.progress.set(pct)
      );
      this.result.set(res);
      this.resultUrl.set(res.dataUrl);

      // `registerResult` (que chama `apply`), não `load`.
      //
      // O commit daqui montava um File e chamava `load()`, e `load()` começa uma
      // sessão NOVA: history e past zerados. Ou seja, melhorar a qualidade no meio
      // de uma cadeia apagava o breadcrumb e o desfazer de tudo que veio antes, e
      // o nome do arquivo passava a derivar do resultado em vez do upload
      // original — que é justamente o `crop-nobg-photo.jpg` que `originalName`
      // existe para impedir.
      const original = this.sourceFile();
      if (original) {
        this.pendingTransition.registerResult(
          'upscale',
          res.blob,
          this.tool.suffix,
          extForMime(original.type) || 'png',
        );
      }
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    const file = this.sourceFile();
    const res = this.result();
    if (!file || !res) return;

    const ext = extForMime(file.type) || 'png';
    saveBlob(res.blob, suffixedName(file.name, this.tool.suffix, ext));
  }

  protected reset(): void {
    this.result.set(null);
    this.resultUrl.set(null);
    this.sourceUrl.set(null);
    this.pendingTransition.clear();
    this.state.clear();
  }
}
