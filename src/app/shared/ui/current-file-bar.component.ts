import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ObjectUrlScope } from '../../core/image/object-url';
import { formatBytes } from '../../core/image/image-file.util';
import { ImageStateService } from '../../core/services/image-state.service';
import { TranslationService } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ButtonDirective } from './button.directive';

/**
 * The file currently flowing through the tool chain, with a thumbnail and the
 * steps already applied. The chain existed before but was invisible, so nobody
 * discovered that "Keep editing" hands the result to the next tool.
 */
@Component({
  selector: 'app-current-file-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [ButtonDirective],
  template: `
    @if (state.session(); as session) {
      <div class="flex items-center gap-3 border-b border-line bg-surface px-5 py-2.5 md:px-8">
        @if (thumb(); as src) {
          <img
            [src]="src"
            alt=""
            class="checkerboard h-8 w-8 shrink-0 rounded-sm border border-line object-cover"
          />
        }

        <div class="flex min-w-0 flex-1 flex-col">
          <div class="flex items-baseline gap-2">
            <span class="truncate text-sm font-medium text-text">{{ session.file.name }}</span>
            <span class="shrink-0 font-mono text-xs text-faint tabular">{{ size() }}</span>
          </div>

          @if (steps().length) {
            <span class="truncate text-xs text-faint">{{ steps().join('  →  ') }}</span>
          }
        </div>

        <button appButton variant="ghost" size="sm" (click)="state.clear()">
          {{ i18n.t()['common.clear'] }}
        </button>
      </div>
    }
  `,
})
export class CurrentFileBarComponent {
  private readonly urls = inject(ObjectUrlScope);

  protected readonly state = inject(ImageStateService);
  protected readonly i18n = inject(TranslationService);

  protected readonly thumb = signal<string | null>(null);

  protected readonly size = computed(() => {
    const file = this.state.currentFile();
    return file ? formatBytes(file.size) : '';
  });

  protected readonly steps = computed(() =>
    this.state.history().map((id) => this.i18n.t()[toolById(id).navKey]),
  );

  constructor() {
    effect(() => {
      const file = this.state.currentFile();
      // `thumb` is read untracked on purpose: tracking it would make this effect
      // depend on the signal it writes, and each pass would mint another object
      // URL — an infinite loop that locked up the tab the moment a file loaded.
      const previous = untracked(this.thumb);

      if (!file) {
        this.urls.revoke(previous);
        this.thumb.set(null);
        return;
      }

      this.thumb.set(this.urls.replace(previous, file));
    });
  }
}
