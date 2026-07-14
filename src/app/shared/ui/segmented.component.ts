import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, model } from '@angular/core';

export interface SegmentOption<T> {
  readonly value: T;
  readonly label: string;
}

/**
 * Radio-group of chips. Replaces the crop ratio buttons, the remove-bg tabs, the
 * convert format grid and the resize presets — four hand-rolled variants of the
 * same control, each with its own ngClass block.
 */
@Component({
  selector: 'app-segmented',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      role="radiogroup"
      [attr.aria-label]="ariaLabel()"
      [class]="containerClass()"
      [style.grid-template-columns]="columns() > 0 ? 'repeat(' + columns() + ', minmax(0, 1fr))' : null"
    >
      @for (option of options(); track option.value) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="option.value === value()"
          (click)="value.set(option.value)"
          [class]="option.value === value() ? selectedClass() : idleClass()"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
})
export class SegmentedComponent<T> {
  readonly options = input.required<readonly SegmentOption<T>[]>();
  readonly value = model.required<T>();
  readonly ariaLabel = input<string>('');
  /** When > 0, lays the options out on a grid instead of a pill-style row. */
  readonly columns = input(0);
  /** Rendered on the rail, whose surface and foreground are a separate ramp. */
  readonly onRail = input(false, { transform: booleanAttribute });

  private readonly pill = 'h-7 rounded-sm px-2.5 text-sm font-medium transition-colors';
  private readonly cell = 'h-9 rounded-md border px-2 text-sm font-medium transition-colors';

  protected readonly containerClass = computed(() => {
    if (this.columns() > 0) return 'grid gap-1.5';
    return this.onRail()
      ? 'flex gap-0.5 rounded-md bg-rail-hover p-0.5'
      : 'flex gap-0.5 rounded-md bg-raised p-0.5';
  });

  protected readonly selectedClass = computed(() => {
    if (this.columns() > 0) return `${this.cell} border-accent bg-accent-soft text-accent`;
    return `${this.pill} bg-accent-fill text-on-accent`;
  });

  protected readonly idleClass = computed(() => {
    if (this.columns() > 0) {
      return `${this.cell} border-line bg-raised text-muted hover:border-line-strong hover:text-text`;
    }
    return this.onRail()
      ? `${this.pill} text-rail-muted hover:text-rail-text`
      : `${this.pill} text-muted hover:text-text`;
  });
}
