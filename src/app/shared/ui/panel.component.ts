import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** A section in the right-hand rail. */
@Component({
  selector: 'app-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-lg border border-line bg-surface shadow-panel">
      @if (heading()) {
        <h2 class="border-b border-line px-4 py-2.5 text-2xs font-medium uppercase text-faint">
          {{ heading() }}
        </h2>
      }

      <div class="p-4">
        <ng-content />
      </div>
    </section>
  `,
})
export class PanelComponent {
  readonly heading = input<string>('');
}
