import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toMessageKey } from '../../core/errors';
import { ObjectUrlScope } from '../../core/image/object-url';
import { ImageStateService } from '../../core/services/image-state.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { TOOLS } from '../../core/tools/tools';
import { AlertComponent } from '../../shared/ui/alert.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import type { IconName } from '../../shared/ui/icon/icons';
import { NetworkProofComponent } from '../../shared/ui/network-proof.component';
import { PreviewSurfaceComponent } from '../../shared/ui/preview-surface.component';

/**
 * The modules the same zero-upload engine is being extended to. Rendered inert:
 * the platform is the architecture, not the tool list, and the home page has to
 * say that without pretending these already ship.
 */
const SOON: ReadonlyArray<{ icon: IconName; nameKey: TranslationKey; descKey: TranslationKey }> = [
  { icon: 'doc', nameKey: 'hero.soon.doc', descKey: 'hero.soon.doc_desc' },
  { icon: 'audio', nameKey: 'hero.soon.audio', descKey: 'hero.soon.audio_desc' },
];

/**
 * The one-click demo. Ships in public/, so loading it is a same-origin request
 * and sends nothing — the counter on this very page stays at zero while you use it.
 *
 * Chosen by running candidates through the actual model, not by taste. What that
 * ruled out is the useful part:
 *
 * - Anything with a visible trademark. A demo asset is not the place to ship
 *   someone else's logo, and half of stock "product photography" is branded.
 * - A subject on a white backdrop: removing the background then looks like
 *   nothing happened.
 * - A black shirt on black: it would vanish against the dark preview stage.
 * - A subject whose skin tone sits close to the backdrop (a portrait on
 *   terracotta): IS-Net loses the boundary and chews holes out of the shoulders.
 *   Contrast between subject and background is what the mask lives on.
 * - A monstera, which cut beautifully — and silently dropped an entire leaf.
 *
 * This one survives: hard contrast against a saturated yellow, so the before/after
 * is unmistakable and the silhouette comes out clean. It does leave some yellow
 * between loose strands of hair, which is the model's known limit on fine hair —
 * a matting problem, not a segmentation one, and the previous engine had it too.
 *
 * Pexels licence: free for commercial use, no attribution required.
 * https://www.pexels.com/photo/415829/
 */
const SAMPLE = { url: 'exemplo.jpg', name: 'exemplo.jpg', type: 'image/jpeg' } as const;

@Component({
  selector: 'app-hero',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    RouterLink,
    DropzoneComponent,
    IconComponent,
    AlertComponent,
    NetworkProofComponent,
    PreviewSurfaceComponent,
  ],
  templateUrl: './hero.component.html',
})
export class HeroComponent {
  private readonly urls = inject(ObjectUrlScope);

  protected readonly state = inject(ImageStateService);
  protected readonly i18n = inject(TranslationService);
  protected readonly tools = TOOLS;
  protected readonly imageTools = TOOLS.filter(t => t.category === 'image');
  protected readonly pdfTools = TOOLS.filter(t => t.category === 'pdf');
  protected readonly soon = SOON;

  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly loadingSample = signal(false);

  /**
   * A real preview of the loaded file, shown right where the dropzone was, so a
   * fresh upload is unmistakably confirmed — the old page only surfaced a 32px
   * thumbnail in the top bar, which read as "did anything happen?".
   */
  protected readonly previewUrl = signal<string | null>(null);

  constructor() {
    effect(() => {
      const file = this.state.currentFile();
      // Read untracked: tracking the signal we write would loop, minting a new
      // object URL every pass (same trap as CurrentFileBarComponent).
      const previous = untracked(this.previewUrl);

      if (!file) {
        this.urls.revoke(previous);
        this.previewUrl.set(null);
        return;
      }

      this.previewUrl.set(this.urls.replace(previous, file));
    });
  }

  /** The home page had no uploader at all: you had to pick a tool before you could load anything. */
  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.state.load(file);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected async useSample(): Promise<void> {
    if (this.loadingSample()) return;

    this.errorKey.set(null);
    this.loadingSample.set(true);

    try {
      const response = await fetch(SAMPLE.url);
      if (!response.ok) throw new Error(`sample ${response.status}`);

      // The served Content-Type is out of our hands, and ImageStateService rejects
      // anything that is not image/*. Declare it rather than trust the header.
      const blob = await response.blob();
      this.state.load(new File([blob], SAMPLE.name, { type: SAMPLE.type }));
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.loadingSample.set(false);
    }
  }
}
