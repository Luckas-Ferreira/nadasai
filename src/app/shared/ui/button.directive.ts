import { Directive, booleanAttribute, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium ' +
  'transition-colors disabled:opacity-40 disabled:pointer-events-none select-none';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'bg-raised text-text border border-line hover:border-line-strong',
  ghost: 'text-muted hover:bg-raised hover:text-text',
  danger: 'text-danger border border-danger-line hover:bg-danger-soft',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-sm',
  md: 'h-9 px-3.5 text-base',
  lg: 'h-11 px-4 text-md',
};

/**
 * A directive rather than a component, so `type`, `disabled` and ARIA stay on a
 * real <button> element.
 */
@Directive({
  selector: 'button[appButton], a[appButton]',
  standalone: true,
  host: {
    '[class]': 'classes()',
    '[attr.aria-busy]': 'busy() || null',
  },
})
export class ButtonDirective {
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');
  readonly block = input(false, { transform: booleanAttribute });
  readonly busy = input(false, { transform: booleanAttribute });

  protected readonly classes = computed(() =>
    [BASE, VARIANTS[this.variant()], SIZES[this.size()], this.block() ? 'w-full' : '']
      .filter(Boolean)
      .join(' '),
  );
}
