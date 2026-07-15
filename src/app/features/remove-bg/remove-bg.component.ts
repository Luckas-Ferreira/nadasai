import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { canvasToBlob, flatten, loadImage, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { BackgroundRemovalService } from '../../core/services/background-removal.service';
import { ImageStateService } from '../../core/services/image-state.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { CompareSliderComponent } from '../../shared/ui/compare-slider.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { PreviewSurfaceComponent } from '../../shared/ui/preview-surface.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';

const TRANSPARENT = 'transparent';
const BACKDROPS = [TRANSPARENT, '#ffffff', '#0a0a0a', '#3a63c8', '#067647', '#b42318'] as const;

@Component({
  selector: 'app-remove-bg',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PreviewSurfaceComponent,
    CompareSliderComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
  ],
  templateUrl: './remove-bg.component.html',
})
export class RemoveBgComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly router = inject(Router);
  private readonly removal = inject(BackgroundRemovalService);
  private readonly tool = toolById('remove-bg');

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopTrickle());
    const file = this.sourceFile();
    if (file) this.sourceUrl.set(this.urls.create(file));
    // Deliberately no auto-run here. Arriving with a file from another tool used
    // to kick the model off immediately — including on already-transparent PNGs —
    // and a second run would start every time the user navigated back.
  }

  protected readonly state = inject(ImageStateService);
  protected readonly i18n = inject(TranslationService);

  protected readonly backdrops = BACKDROPS;
  protected readonly transparent = TRANSPARENT;

  protected readonly sourceUrl = signal<string | null>(null);
  protected readonly cutoutBlob = signal<Blob | null>(null);
  protected readonly cutoutUrl = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly progress = signal(0);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly backdrop = signal<string>(TRANSPARENT);

  protected readonly sourceFile = this.state.currentFile;
  protected readonly isTransparent = computed(() => this.backdrop() === TRANSPARENT);

  /** Latest real milestone from the service; the trickle eases the shown bar toward it. */
  private progressTarget = 0;
  private displayed = 0;
  private trickle?: ReturnType<typeof setInterval>;

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.state.load(file);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
      return;
    }

    this.sourceUrl.set(this.urls.replace(this.sourceUrl(), file));
    this.clearResult();
    this.backdrop.set(TRANSPARENT);

    // A fresh drop is an explicit request, so run straight away.
    void this.run();
  }

  protected async run(): Promise<void> {
    const file = this.sourceFile();
    if (!file || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.startTrickle();

    try {
      // The service reports real milestones (byte-accurate for the download); the
      // trickle keeps the bar gliding between them so the long, unmeasurable
      // inference never looks frozen.
      const blob = await this.removal.removeBackground(file, (pct) => (this.progressTarget = pct));
      this.cutoutBlob.set(blob);
      this.cutoutUrl.set(this.urls.replace(this.cutoutUrl(), blob));
      this.finishTrickle();
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
      this.stopTrickle();
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * A self-animating progress bar for an operation whose duration cannot be known.
   * Each tick eases the shown value toward the latest real milestone, and — when
   * that milestone sits still through the opaque WASM inference — keeps creeping
   * asymptotically toward 95%, decelerating so it reads as "almost there" rather
   * than stuck. finishTrickle() snaps it to 100.
   */
  private startTrickle(): void {
    this.stopTrickle();
    this.progress.set(0);
    this.progressTarget = 0;

    // Kept as a float so the easing does not stall on rounding; the display rounds.
    this.displayed = 0;
    this.trickle = setInterval(() => {
      const toward = (this.progressTarget - this.displayed) * 0.15; // chase real milestones
      const creep = (95 - this.displayed) * 0.02; // always inch forward, slowing near the cap
      this.displayed = Math.min(95, this.displayed + Math.max(toward, creep, 0));
      this.progress.set(Math.round(this.displayed));
    }, 70);
  }

  private finishTrickle(): void {
    this.stopTrickle();
    this.progress.set(100);
  }

  private stopTrickle(): void {
    if (this.trickle) {
      clearInterval(this.trickle);
      this.trickle = undefined;
    }
  }

  /** Composites the cutout onto the chosen backdrop. Transparent stays a PNG as-is. */
  private async compose(): Promise<{ blob: Blob; ext: string } | null> {
    const blob = this.cutoutBlob();
    if (!blob) return null;

    if (this.isTransparent()) return { blob, ext: 'png' };

    const img = await loadImage(blob);
    const canvas = flatten(img, this.backdrop());
    return { blob: await canvasToBlob(canvas, 'image/png'), ext: 'png' };
  }

  protected async download(): Promise<void> {
    const session = this.state.session();
    if (!session) return;

    try {
      const result = await this.compose();
      if (!result) return;

      // The output is always PNG. The old code kept the source extension, so a
      // JPEG upload downloaded as `nobg-photo.jpg` containing PNG bytes.
      saveBlob(result.blob, suffixedName(session.originalName, this.tool.suffix, result.ext));
    } catch (err) {
      console.error('Export failed:', err);
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected async continueEdit(): Promise<void> {
    try {
      const result = await this.compose();
      if (!result) return;

      this.state.apply('remove-bg', result.blob, this.tool.suffix, result.ext);
      this.router.navigate(['/']);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected reset(): void {
    this.stopTrickle();
    this.urls.releaseAll();
    this.sourceUrl.set(null);
    this.cutoutBlob.set(null);
    this.cutoutUrl.set(null);
    this.errorKey.set(null);
    this.progress.set(0);
    this.backdrop.set(TRANSPARENT);
    this.state.clear();
  }

  private clearResult(): void {
    this.urls.revoke(this.cutoutUrl());
    this.cutoutBlob.set(null);
    this.cutoutUrl.set(null);
  }
}
