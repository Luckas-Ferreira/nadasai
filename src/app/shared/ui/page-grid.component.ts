import { ChangeDetectionStrategy, Component, booleanAttribute, inject, input, output, signal } from '@angular/core';
import { TranslationService } from '../../core/services/translation.service';
import { IconComponent } from './icon/icon.component';

export interface PageItem {
  readonly id: string;
  /** Shown under the thumbnail and used as its alt text. */
  readonly label: string;
  readonly url: string;
  /** Degrees clockwise, 0/90/180/270. Only meaningful when `rotatable`. */
  readonly rotation?: number;
}

/**
 * The page strip: thumbnails in output order, reorderable.
 *
 * Drag-and-drop is the obvious gesture and it is NOT enough on its own — it does
 * nothing on a touch screen and nothing from the keyboard. The arrow buttons are
 * the real control; the drag is the shortcut for people holding a mouse.
 *
 * It sits on `bg-stage`, dark in both themes like every other surface that holds
 * an image, so its own type is white-on-stage rather than the page tokens.
 *
 * Shared by img-to-pdf (images becoming pages) and merge-pdf (pages of real
 * PDFs), which is why it knows nothing about Files — just a label and a URL.
 */
@Component({
  selector: 'app-page-grid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <ol class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" [attr.aria-label]="ariaLabel()">
      @for (item of items(); track item.id; let i = $index) {
        <li
          draggable="true"
          (dragstart)="onDragStart($event, i)"
          (dragover)="onDragOver($event, i)"
          (drop)="onDrop($event, i)"
          (dragend)="clearDrag()"
          [class]="tileClass(i)"
        >
          <div class="flex aspect-square items-center justify-center overflow-hidden p-2">
            <img
              [src]="item.url"
              [alt]="item.label"
              class="max-h-full max-w-full object-contain transition-transform duration-200"
              [style.transform]="item.rotation ? 'rotate(' + item.rotation + 'deg)' : null"
            />
          </div>

          <span
            class="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-sm
                   bg-black/60 px-1 font-mono text-2xs text-white tabular"
          >
            {{ i + 1 }}
          </span>

          <div class="absolute right-1.5 top-1.5 flex gap-1">
            @if (rotatable()) {
              <button
                type="button"
                [attr.aria-label]="i18n.t()['pages.rotate'] + ' — ' + item.label"
                (click)="rotate.emit(i)"
                class="flex h-5 w-5 items-center justify-center rounded-sm bg-black/60 text-white/70
                       transition-colors hover:bg-accent-fill hover:text-on-accent"
              >
                <app-icon name="rotate" [size]="12" />
              </button>
            }

            <button
              type="button"
              [attr.aria-label]="i18n.t()['pages.remove'] + ' — ' + item.label"
              (click)="remove.emit(i)"
              class="flex h-5 w-5 items-center justify-center rounded-sm bg-black/60 text-white/70
                     transition-colors hover:bg-danger hover:text-white"
            >
              <app-icon name="close" [size]="12" />
            </button>
          </div>

          <div class="flex items-center justify-between border-t border-white/10 px-1 py-1">
            <button
              type="button"
              [attr.aria-label]="i18n.t()['pages.move_left']"
              [disabled]="i === 0"
              (click)="reorder.emit({ from: i, to: i - 1 })"
              [class]="stepButton"
            >
              <app-icon name="chevronLeft" [size]="14" />
            </button>

            <span class="min-w-0 truncate px-1 text-2xs text-white/45">{{ item.label }}</span>

            <button
              type="button"
              [attr.aria-label]="i18n.t()['pages.move_right']"
              [disabled]="i === items().length - 1"
              (click)="reorder.emit({ from: i, to: i + 1 })"
              [class]="stepButton"
            >
              <app-icon name="chevronRight" [size]="14" />
            </button>
          </div>
        </li>
      }
    </ol>
  `,
})
export class PageGridComponent {
  protected readonly i18n = inject(TranslationService);

  readonly items = input.required<readonly PageItem[]>();
  readonly ariaLabel = input<string>('');
  readonly rotatable = input(false, { transform: booleanAttribute });

  readonly reorder = output<{ from: number; to: number }>();
  readonly remove = output<number>();
  readonly rotate = output<number>();

  protected readonly from = signal<number | null>(null);
  protected readonly over = signal<number | null>(null);

  private readonly tile =
    'group relative flex cursor-grab flex-col overflow-hidden rounded-md border bg-white/5 ' +
    'transition-colors active:cursor-grabbing';

  /**
   * Built in TS rather than as `[class.border-white/10]` bindings: the slash in
   * an opacity-modified utility is not a valid class-binding name.
   */
  protected tileClass(index: number): string {
    const border = this.over() === index ? 'border-accent' : 'border-white/10';
    return `${this.tile} ${border}${this.from() === index ? ' opacity-40' : ''}`;
  }

  protected readonly stepButton =
    'flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-white/60 ' +
    'transition-colors hover:bg-white/10 hover:text-white disabled:opacity-25 disabled:pointer-events-none';

  protected onDragStart(event: DragEvent, index: number): void {
    this.from.set(index);
    // Firefox refuses to start a drag unless some data is set.
    event.dataTransfer?.setData('text/plain', String(index));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  protected onDragOver(event: DragEvent, index: number): void {
    if (this.from() === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.over.set(index);
  }

  protected onDrop(event: DragEvent, index: number): void {
    const from = this.from();
    this.clearDrag();
    // Null means the drag started outside this grid (a file from the desktop,
    // say) — dropping it here must not silently shuffle the pages.
    if (from === null) return;

    event.preventDefault();
    if (from !== index) this.reorder.emit({ from, to: index });
  }

  protected clearDrag(): void {
    this.from.set(null);
    this.over.set(null);
  }
}
