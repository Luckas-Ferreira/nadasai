import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { input } from '@angular/core';
import { TranslationService } from '../../core/services/translation.service';
import { ToolId, toolById } from '../../core/tools/tools';
import { IconComponent } from './icon/icon.component';

/**
 * Shell for a tool: heading + stage/panel split.
 *
 * Left-aligned 22px heading. Every tool used to open with its own centred
 * `text-6xl font-black` hero, which pushed the actual work below the fold and
 * was the loudest generated-looking tell in the old design.
 */
@Component({
  selector: 'app-tool-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <section class="mx-auto w-full max-w-[1240px]">
      <header class="mb-5 flex items-start gap-3">
        <span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-accent">
          <app-icon [name]="tool().icon" [size]="18" />
        </span>

        <div>
          <h1 class="text-2xl">{{ i18n.t()[tool().titleKey] }}</h1>
          <p class="mt-0.5 text-md text-muted">{{ i18n.t()[tool().descKey] }}</p>
        </div>
      </header>

      <ng-content select="[banner]" />

      <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_324px]">
        <div class="min-w-0">
          <ng-content select="[stage]" />
        </div>

        <aside class="min-w-0">
          <ng-content select="[panel]" />
        </aside>
      </div>
    </section>
  `,
})
export class ToolPageComponent {
  protected readonly i18n = inject(TranslationService);

  readonly toolId = input.required<ToolId>();

  protected readonly tool = computed(() => toolById(this.toolId()));
}
