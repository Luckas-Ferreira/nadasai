import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, inject, input, output, signal, viewChild } from '@angular/core';
import { ACCEPT_ATTR } from '../../core/image/image-file.util';
import { TranslationService } from '../../core/services/translation.service';
import { IconComponent } from './icon/icon.component';

/**
 * The single upload surface for the whole app. Replaces five identical
 * drag-and-drop blocks plus five copies of onDragOver/onDragLeave/onDrop/
 * onFileSelected.
 *
 * Themed, NOT on the dark stage. The stage is dark because a light surround
 * skews how you judge an image's brightness — but an empty dropzone has no
 * image in it, so on the light theme it was just a black slab.
 *
 * Validation is the caller's job (ImageStateService / assertUsableImage) — this
 * only emits the File. `accept` is a filter, not a guarantee: the OS picker lets
 * users switch to "All files", which is how a .txt used to reach the tools.
 */
@Component({
  selector: 'app-dropzone',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div
      role="button"
      tabindex="0"
      [attr.aria-label]="i18n.t()['common.upload_btn']"
      (click)="open()"
      (keydown.enter)="open()"
      (keydown.space)="$event.preventDefault(); open()"
      (dragenter)="onDragEnter($event)"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
      class="group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden
             rounded-xl border-2 border-dashed bg-surface text-center transition-all duration-200"
      [class.border-line-strong]="!dragging()"
      [class.border-accent]="dragging()"
      [class.px-6]="compact()"
      [class.py-10]="compact()"
      [class.px-8]="!compact()"
      [class.py-20]="!compact()"
      [style.box-shadow]="dragging() ? 'inset 0 0 60px var(--accent-line)' : null"
    >
      <span
        class="flex h-12 w-12 items-center justify-center rounded-full bg-raised text-muted
               transition-colors group-hover:bg-accent-fill group-hover:text-on-accent"
        [class.bg-accent-fill]="dragging()"
        [class.text-on-accent]="dragging()"
      >
        <app-icon name="upload" [size]="20" />
      </span>

      <p class="mt-4 text-lg font-medium text-text">{{ i18n.t()[titleKey()] }}</p>

      <p class="mt-1 text-sm text-muted">
        {{ i18n.t()['common.or'] }}
        <span class="font-medium text-accent underline underline-offset-2">
          {{ i18n.t()[buttonKey()] }}
        </span>
      </p>

      @if (!compact()) {
        <p class="mt-6 text-xs text-faint tabular">{{ i18n.t()[hintKey()] }}</p>
      }

      <input
        #input
        type="file"
        class="hidden"
        [accept]="accept()"
        [attr.multiple]="multiple() ? '' : null"
        (change)="onSelected($event)"
        (click)="$event.stopPropagation()"
      />
    </div>
  `,
})
export class DropzoneComponent {
  protected readonly i18n = inject(TranslationService);

  readonly accept = input(ACCEPT_ATTR);
  readonly compact = input(false, { transform: booleanAttribute });
  /** Only affects the picker and `filesSelected`; `fileSelected` still emits one file. */
  readonly multiple = input(false, { transform: booleanAttribute });

  readonly titleKey = input<keyof ReturnType<typeof TranslationService.prototype.t>>('common.drag');
  readonly hintKey = input<keyof ReturnType<typeof TranslationService.prototype.t>>('common.drag_hint');
  readonly buttonKey = input<keyof ReturnType<typeof TranslationService.prototype.t>>('common.upload_btn');

  readonly fileSelected = output<File>();
  /**
   * Every file from the drop or the picker. Emitted alongside `fileSelected`
   * rather than instead of it, so the five single-file tools are untouched.
   */
  readonly filesSelected = output<File[]>();

  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');
  protected readonly dragging = signal(false);

  /**
   * dragenter/dragleave fire for every child element the cursor crosses, so a
   * naive boolean flickers. Counting entries against leaves is the fix.
   */
  private depth = 0;

  protected open(): void {
    this.input().nativeElement.click();
  }

  protected onDragEnter(event: DragEvent): void {
    event.preventDefault();
    this.depth++;
    this.dragging.set(true);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.depth = Math.max(0, this.depth - 1);
    if (this.depth === 0) this.dragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.depth = 0;
    this.dragging.set(false);

    this.emit(event.dataTransfer?.files);
  }

  protected onSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.emit(input.files);
    // Allow re-selecting the same file immediately after a reset.
    input.value = '';
  }

  private emit(list: FileList | null | undefined): void {
    const files = Array.from(list ?? []);
    if (!files.length) return;

    this.fileSelected.emit(files[0]);
    this.filesSelected.emit(files);
  }
}
