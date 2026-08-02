import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationService } from '../../../core/services/translation.service';
import { toolById } from '../../../core/tools/tools';
import { ToolPageComponent } from '../../../shared/ui/tool-page.component';
import { PanelComponent } from '../../../shared/ui/panel.component';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
}

/**
 * Myers diff algorithm (simplified LCS-based) for correct line-level diffing.
 * Produces proper add/remove/unchanged blocks without false positives.
 */
function computeDiff(origLines: string[], modLines: string[]): DiffLine[] {
  const m = origLines.length;
  const n = modLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origLines[i - 1] === modLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === modLines[j - 1]) {
      result.unshift({ type: 'unchanged', text: origLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', text: modLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'removed', text: origLines[i - 1] });
      i--;
    }
  }
  return result;
}

@Component({
  selector: 'app-diff-checker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ToolPageComponent, PanelComponent, ButtonDirective, IconComponent],
  template: `
    <app-tool-page [toolId]="'diff-checker'" [forceLoaded]="!!(textOriginal() || textModified())">

      <!-- STAGE: two-column text inputs + diff result -->
      <div stage class="space-y-5">

        <!-- Two text input panels -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

          <!-- Original -->
          <div class="flex flex-col rounded-lg border border-line bg-surface shadow-panel overflow-hidden">
            <div class="flex items-center justify-between border-b border-line px-4 py-2.5">
              <h2 class="text-2xs font-medium uppercase text-faint tracking-wide">
                {{ i18n.t()['diff.original'] }}
              </h2>
              <label class="cursor-pointer">
                <button type="button" appButton variant="ghost" size="sm" class="pointer-events-none">
                  <app-icon name="upload" [size]="13" />
                  {{ i18n.t()['diff.load_file'] }}
                </button>
                <input
                  type="file"
                  accept=".txt,.md,.json,.csv,.js,.ts,.css,.html,.py,.xml"
                  (change)="loadFile($event, 'orig')"
                  class="hidden"
                />
              </label>
            </div>
            <textarea
              [ngModel]="textOriginal()"
              (ngModelChange)="textOriginal.set($event)"
              [placeholder]="i18n.t()['diff.paste_hint']"
              rows="14"
              class="w-full flex-1 bg-raised p-4 text-xs font-mono text-text focus:outline-none resize-none border-0 outline-none"
            ></textarea>
            <div class="flex items-center justify-between border-t border-line px-4 py-1.5 text-[10px] font-mono text-faint">
              <span>{{ lineCount(textOriginal()) }} linhas</span>
              <span>{{ charCount(textOriginal()) }} chars</span>
            </div>
          </div>

          <!-- Modified -->
          <div class="flex flex-col rounded-lg border border-line bg-surface shadow-panel overflow-hidden">
            <div class="flex items-center justify-between border-b border-line px-4 py-2.5">
              <h2 class="text-2xs font-medium uppercase text-faint tracking-wide">
                {{ i18n.t()['diff.modified'] }}
              </h2>
              <label class="cursor-pointer">
                <button type="button" appButton variant="ghost" size="sm" class="pointer-events-none">
                  <app-icon name="upload" [size]="13" />
                  {{ i18n.t()['diff.load_file'] }}
                </button>
                <input
                  type="file"
                  accept=".txt,.md,.json,.csv,.js,.ts,.css,.html,.py,.xml"
                  (change)="loadFile($event, 'mod')"
                  class="hidden"
                />
              </label>
            </div>
            <textarea
              [ngModel]="textModified()"
              (ngModelChange)="textModified.set($event)"
              [placeholder]="i18n.t()['diff.paste_hint']"
              rows="14"
              class="w-full flex-1 bg-raised p-4 text-xs font-mono text-text focus:outline-none resize-none border-0 outline-none"
            ></textarea>
            <div class="flex items-center justify-between border-t border-line px-4 py-1.5 text-[10px] font-mono text-faint">
              <span>{{ lineCount(textModified()) }} linhas</span>
              <span>{{ charCount(textModified()) }} chars</span>
            </div>
          </div>
        </div>

        <!-- Diff result viewer -->
        @if (diffLines().length > 0) {
          <div class="rounded-lg border border-line bg-surface shadow-panel overflow-hidden">
            <div class="flex items-center justify-between border-b border-line px-4 py-2.5">
              <h2 class="text-2xs font-medium uppercase text-faint tracking-wide">
                {{ i18n.t()['diff.result_title'] }}
              </h2>
              @if (hasDifferences()) {
                <div class="flex items-center gap-3 text-xs font-mono">
                  <span class="text-accent font-semibold">+{{ addedCount() }}</span>
                  <span class="text-danger font-semibold">−{{ removedCount() }}</span>
                </div>
              }
            </div>

            <div class="overflow-auto max-h-[420px]">
              @for (line of diffLines(); track $index) {
                <div
                  class="flex items-stretch min-h-[22px] text-xs font-mono leading-relaxed"
                  [class.bg-accent-soft]="line.type === 'added'"
                  [class.bg-danger-soft]="line.type === 'removed'"
                >
                  <!-- Line number + sign gutter -->
                  <div
                    class="flex w-12 shrink-0 select-none items-center justify-center border-r text-[10px] font-bold"
                    [class.border-accent-line]="line.type === 'added'"
                    [class.text-accent]="line.type === 'added'"
                    [class.border-danger-line]="line.type === 'removed'"
                    [class.text-danger]="line.type === 'removed'"
                    [class.border-line]="line.type === 'unchanged'"
                    [class.text-faint]="line.type === 'unchanged'"
                  >
                    @if (line.type === 'added') { + }
                    @else if (line.type === 'removed') { − }
                    @else { &nbsp; }
                  </div>

                  <!-- Line content -->
                  <span
                    class="min-w-0 flex-1 whitespace-pre-wrap break-all px-4 py-0.5"
                    [class.text-accent]="line.type === 'added'"
                    [class.text-danger]="line.type === 'removed'"
                    [class.text-muted]="line.type === 'unchanged'"
                  >{{ line.text || '&nbsp;' }}</span>
                </div>
              }
            </div>
          </div>
        }

      </div>

      <!-- Panel slot: stats sidebar shown after content exists -->
      <div panel class="flex flex-col gap-4">
        @if (textOriginal() || textModified()) {
          <app-panel [heading]="i18n.t()['diff.result_title']">
            <div class="space-y-3">
              <div class="flex items-center justify-between text-sm">
                <span class="text-muted">{{ i18n.t()['diff.original'] }}</span>
                <span class="font-mono text-text tabular">{{ lineCount(textOriginal()) }} lin.</span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-muted">{{ i18n.t()['diff.modified'] }}</span>
                <span class="font-mono text-text tabular">{{ lineCount(textModified()) }} lin.</span>
              </div>

              @if (hasDifferences()) {
                <div class="rounded-md border border-line bg-raised p-3 space-y-2 text-xs font-mono">
                  <div class="flex justify-between text-accent">
                    <span>{{ i18n.t()['diff.added'] }}</span>
                    <span class="font-bold">+{{ addedCount() }}</span>
                  </div>
                  <div class="flex justify-between text-danger">
                    <span>{{ i18n.t()['diff.removed'] }}</span>
                    <span class="font-bold">−{{ removedCount() }}</span>
                  </div>
                </div>
              } @else if (diffLines().length > 0) {
                <p class="text-xs font-medium text-accent">{{ i18n.t()['diff.no_changes'] }}</p>
              }

              <div class="mt-1 flex justify-center border-t border-line pt-2">
                <button appButton variant="ghost" size="sm" (click)="clear()">
                  {{ i18n.t()['common.reset'] }}
                </button>
              </div>
            </div>
          </app-panel>
        }
      </div>

    </app-tool-page>
  `,
})
export class DiffCheckerComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly tool = toolById('diff-checker');

  protected readonly textOriginal = signal('');
  protected readonly textModified = signal('');

  protected async loadFile(event: Event, target: 'orig' | 'mod'): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const text = await input.files[0].text();
    if (target === 'orig') this.textOriginal.set(text);
    else this.textModified.set(text);
    // Reset input so same file can be reloaded
    input.value = '';
  }

  protected readonly diffLines = computed(() => {
    const orig = this.textOriginal();
    const mod = this.textModified();
    if (!orig && !mod) return [];
    return computeDiff(orig.split('\n'), mod.split('\n'));
  });

  protected readonly hasDifferences = computed(() =>
    this.diffLines().some((l) => l.type !== 'unchanged')
  );

  protected readonly addedCount = computed(() =>
    this.diffLines().filter((l) => l.type === 'added').length
  );

  protected readonly removedCount = computed(() =>
    this.diffLines().filter((l) => l.type === 'removed').length
  );

  protected lineCount(text: string): number {
    return text ? text.split('\n').length : 0;
  }

  protected charCount(text: string): number {
    return text.length;
  }

  protected clear(): void {
    this.textOriginal.set('');
    this.textModified.set('');
  }
}
