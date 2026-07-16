import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { ObjectUrlScope } from '../../core/image/object-url';
import { formatBytes } from '../../core/image/image-file.util';
import { ImageStateService } from '../../core/services/image-state.service';
import { TranslationService } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon/icon.component';

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
  imports: [ButtonDirective, IconComponent],
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

        @if (undoLabel(); as label) {
          <button appButton variant="ghost" size="sm" class="shrink-0" (click)="undo()">
            <app-icon name="undo" [size]="14" />
            {{ label }}
          </button>
        }

        <button appButton variant="ghost" size="sm" class="shrink-0" (click)="state.clear()">
          {{ i18n.t()['common.clear'] }}
        </button>
      </div>
    }
  `,
})
export class CurrentFileBarComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly router = inject(Router);

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

  /**
   * "Undo Crop", not "Undo" — the button sits right next to the breadcrumb, so it
   * should name the step it is about to remove from it. Null when the file is an
   * untouched upload and there is nothing to step back to.
   */
  protected readonly undoLabel = computed(() => {
    const tool = this.state.undoableTool();
    return tool ? `${this.i18n.t()['common.undo_tool']} ${this.i18n.t()[toolById(tool).navKey]}` : null;
  });

  /**
   * Undo, then go home.
   *
   * The navigation is not decoration: a tool reads its source file once, when it
   * is constructed, so reverting the chain while one is open would leave it
   * showing the old image with no way to notice. Going home rebuilds from the
   * restored file — the same reason continueEdit() routes here after apply().
   */
  protected undo(): void {
    this.state.undo();
    void this.router.navigate(['/']);
  }

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
