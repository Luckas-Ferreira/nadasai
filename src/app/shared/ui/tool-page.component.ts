import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { input } from '@angular/core';
import { ImageStateService } from '../../core/services/image-state.service';
import { TranslationService } from '../../core/services/translation.service';
import { ToolId, toolById } from '../../core/tools/tools';
import { IconComponent } from './icon/icon.component';

/**
 * Shell for a tool: heading + stage/panel split.
 *
 * Left-aligned 22px heading. Every tool used to open with its own centred
 * `text-6xl font-black` hero, which pushed the actual work below the fold and
 * was the loudest generated-looking tell in the old design.
 *
 * The body has TWO layouts, keyed off whether a file is loaded:
 *
 * - Empty (no file): a single, narrower column centred in the page. The panel
 *   is empty until there is a file to act on, so the old fixed two-column grid
 *   reserved a 324px track that was always blank — the dropzone sat shoved to
 *   the left with dead space beside and below it, which read as broken.
 * - Loaded: the stage/panel split, where the controls finally have content.
 */
@Component({
  selector: 'app-tool-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <section class="mx-auto w-full max-w-[1240px]">
      <header class="mb-5 flex items-start gap-3">
        <span
          [style.--tone-fg]="'var(--tone-' + tool().tone + '-fg)'"
          [style.--tone-bg]="'var(--tone-' + tool().tone + '-bg)'"
          class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--tone-bg)] text-[color:var(--tone-fg)]"
        >
          <app-icon [name]="tool().icon" [size]="19" />
        </span>

        <div>
          <h1 class="text-2xl">{{ i18n.t()[tool().titleKey] }}</h1>
          <p class="mt-0.5 text-md text-muted">{{ i18n.t()[tool().descKey] }}</p>
        </div>
      </header>

      <ng-content select="[banner]" />

      <!-- One container, two shapes. The ng-content slots are declared ONCE (each
           slot projects exactly once), and only the wrapper's classes change: a
           centred single column while empty, the stage/panel grid once loaded.
           The aside simply renders nothing until the tool fills its panel. -->
      <div [class]="loaded() ? loadedLayout : emptyLayout">
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
  private readonly state = inject(ImageStateService);

  readonly toolId = input.required<ToolId>();

  protected readonly tool = computed(() => toolById(this.toolId()));

  /** Drives the layout: the panel only has content once a file is in the chain. */
  protected readonly loaded = computed(() => !!this.state.currentFile());

  protected readonly loadedLayout = 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_324px]';
  protected readonly emptyLayout = 'mx-auto w-full max-w-[680px]';
}
