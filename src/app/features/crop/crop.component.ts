import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import Cropper from 'cropperjs';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { canvasToBlob, extForMime, formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { ImageStateService } from '../../core/services/image-state.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';

/** GIF and BMP have no lossy encoder here; PNG keeps their alpha and quality. */
const ALPHA_SAFE = new Set(['image/png', 'image/webp', 'image/gif', 'image/bmp']);

@Component({
  selector: 'app-crop',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    ButtonDirective,
    IconComponent,
  ],
  templateUrl: './crop.component.html',
})
export class CropComponent implements OnDestroy {
  private readonly urls = inject(ObjectUrlScope);
  private readonly router = inject(Router);
  private readonly tool = toolById('crop');

  protected readonly state = inject(ImageStateService);
  protected readonly i18n = inject(TranslationService);

  private readonly imageRef = viewChild<ElementRef<HTMLImageElement>>('image');
  private cropper: Cropper | null = null;

  protected readonly sourceUrl = signal<string | null>(null);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly resultUrl = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly ratio = signal<number | null>(null);

  protected readonly sourceFile = this.state.currentFile;

  protected readonly ratioOptions = [
    { value: null, label: '' },
    { value: 1, label: '1:1' },
    { value: 16 / 9, label: '16:9' },
    { value: 4 / 3, label: '4:3' },
    { value: 3 / 2, label: '3:2' },
  ];

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : null;
  });

  /** The current selection, and the one the result on screen was cut from. */
  private readonly boxKey = signal('');
  private readonly ranBox = signal<string | null>(null);

  /**
   * Cropping the same box twice yields the same image, so the button goes once the
   * result matches the selection — and comes straight back on the next drag, ratio,
   * rotate or flip, which is how this tool is actually used.
   */
  protected readonly stale = computed(() => this.ranBox() !== this.boxKey());

  /**
   * The box lives in cropper.js's own DOM state, not in a signal, so its `crop`
   * event is the only way to hear about it. getData(true) rounds to natural pixels:
   * a window resize reflows the box on screen without changing what it selects, and
   * that must not read as an edit.
   */
  private readonly syncBox = (): void => {
    this.boxKey.set(JSON.stringify(this.cropper?.getData(true) ?? null));
  };

  constructor() {
    const file = this.sourceFile();
    if (file) this.sourceUrl.set(this.urls.create(file));

    // The <img> only exists once a source is set, so attach the Cropper when the
    // view child appears. It then stays mounted for the life of the component —
    // the old code hid it behind *ngIf after cropping, orphaning the instance
    // (its window listeners survived) and making a second crop impossible.
    effect(() => {
      const element = this.imageRef()?.nativeElement;
      if (!element || this.cropper) return;

      this.cropper = new Cropper(element, {
        viewMode: 2,
        background: false,
        autoCropArea: 0.9,
        responsive: true,
      });

      // `crop` fires for every route the box can move by — dragging, zooming, and
      // the ratio/rotate/flip/reset buttons all rewrite the same data.
      element.addEventListener('crop', this.syncBox);
    });
  }

  ngOnDestroy(): void {
    this.destroyCropper();
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.state.load(file);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
      return;
    }

    this.clearResult();
    this.sourceUrl.set(this.urls.replace(this.sourceUrl(), file));

    // Same <img> element, new source: swap it in place rather than rebuilding.
    const element = this.imageRef()?.nativeElement;
    if (this.cropper && element) this.cropper.replace(this.sourceUrl()!);
  }

  protected setRatio(value: number | null): void {
    this.ratio.set(value);
    this.cropper?.setAspectRatio(value ?? NaN);
  }

  protected rotate(): void {
    this.cropper?.rotate(90);
  }

  protected flip(): void {
    const data = this.cropper?.getData();
    this.cropper?.scaleX((data?.scaleX ?? 1) * -1);
  }

  protected resetBox(): void {
    this.cropper?.reset();
  }

  protected async run(): Promise<void> {
    const file = this.sourceFile();
    if (!file || !this.cropper) return;

    this.busy.set(true);
    this.errorKey.set(null);

    try {
      const box = this.boxKey();
      const canvas = this.cropper.getCroppedCanvas({
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      });

      // Preserve transparency for any alpha-capable source. The old code only
      // did this for PNG, so cropping a WebP silently flattened it to JPEG.
      const mime = ALPHA_SAFE.has(file.type) ? 'image/png' : 'image/jpeg';
      const blob = await canvasToBlob(canvas, mime, mime === 'image/jpeg' ? 0.92 : undefined);

      this.resultBlob.set(blob);
      this.resultUrl.set(this.urls.replace(this.resultUrl(), blob));
      this.ranBox.set(box);
    } catch (err) {
      console.error('Crop failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    const blob = this.resultBlob();
    const session = this.state.session();
    if (!blob || !session) return;

    saveBlob(blob, suffixedName(session.originalName, this.tool.suffix, extForMime(blob.type)));
  }

  protected continueEdit(): void {
    const blob = this.resultBlob();
    if (!blob) return;

    try {
      this.state.apply('crop', blob, this.tool.suffix, extForMime(blob.type));
      this.router.navigate(['/']);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected reset(): void {
    this.destroyCropper();
    this.urls.releaseAll();
    this.sourceUrl.set(null);
    this.resultBlob.set(null);
    this.resultUrl.set(null);
    this.ranBox.set(null);
    this.errorKey.set(null);
    this.ratio.set(null);
    this.state.clear();
  }

  private clearResult(): void {
    this.urls.revoke(this.resultUrl());
    this.resultBlob.set(null);
    this.resultUrl.set(null);
    this.ranBox.set(null);
  }

  private destroyCropper(): void {
    this.cropper?.destroy();
    this.cropper = null;
  }
}
