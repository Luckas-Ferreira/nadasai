import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { formatBytes } from '../../core/image/image-file.util';
import { AudioStateService } from '../../core/services/audio-state.service';
import { TranslationService } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon/icon.component';

/** Maps the audio extension to one of the design-system tone variables. */
function toneForExt(ext: string): string {
  const map: Record<string, string> = {
    mp3:  'amber',
    wav:  'sky',
    ogg:  'emerald',
    oga:  'emerald',
    m4a:  'violet',
    aac:  'orange',
    flac: 'indigo',
    webm: 'teal',
    opus: 'fuchsia',
  };
  return map[ext.toLowerCase()] ?? 'violet';
}

/**
 * The persistent audio file band shown below the top bar for the whole
 * audio module. It displays current file metadata, applied tool history
 * breadcrumbs (e.g. Cortar Áudio → Comprimir Áudio), and step-by-step Undo.
 */
@Component({
  selector: 'app-current-audio-file-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, IconComponent],
  styles: [`
    /* --- Animated equalizer bars ----------------------------------------- */
    .eq-wrap {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      height: 18px;
      flex-shrink: 0;
    }

    .eq-bar {
      display: block;
      width: 3px;
      border-radius: 2px;
      animation: eq-dance 1.5s ease-in-out infinite;
      transform-origin: center bottom;
    }

    .eq-bar:nth-child(1) { height: 55%; animation-delay: 0.00s; }
    .eq-bar:nth-child(2) { height: 90%; animation-delay: 0.18s; }
    .eq-bar:nth-child(3) { height: 40%; animation-delay: 0.09s; }
    .eq-bar:nth-child(4) { height: 75%; animation-delay: 0.27s; }

    @keyframes eq-dance {
      0%,  100% { transform: scaleY(0.22); opacity: 0.55; }
      50%        { transform: scaleY(1.00); opacity: 1.00; }
    }

    @media (prefers-reduced-motion: reduce) {
      .eq-bar { animation: none; transform: none; opacity: 0.7; }
    }

    /* --- Slide-in entrance ------------------------------------------------ */
    .audio-bar-enter {
      animation: bar-slide-down 0.22s var(--ease-out, cubic-bezier(0.16,1,0.3,1)) both;
    }

    @keyframes bar-slide-down {
      from { opacity: 0; transform: translateY(-6px); }
      to   { opacity: 1; transform: translateY(0);    }
    }
  `],
  template: `
    @if (audioState.session(); as session) {
      <div
        class="audio-bar-enter relative flex items-center gap-3 overflow-hidden border-b border-line bg-surface px-5 py-2.5 md:px-8"
        [style.background]="barBg()"
      >
        <!-- Left accent stripe -->
        <span
          class="absolute left-0 top-0 h-full w-[3px] shrink-0 rounded-r-full"
          [style.background-color]="accentColor()"
          aria-hidden="true"
        ></span>

        <!-- Animated equalizer -->
        <div class="eq-wrap pl-1.5" aria-hidden="true">
          <span class="eq-bar" [style.background-color]="accentColor()"></span>
          <span class="eq-bar" [style.background-color]="accentColor()"></span>
          <span class="eq-bar" [style.background-color]="accentColor()"></span>
          <span class="eq-bar" [style.background-color]="accentColor()"></span>
        </div>

        <!-- File info + history steps -->
        <div class="flex min-w-0 flex-1 flex-col justify-center">
          <div class="flex min-w-0 items-center gap-2">
            <!-- Name -->
            <span class="truncate text-sm font-semibold text-text">
              {{ session.file.name }}
            </span>

            <!-- Format badge -->
            <span
              class="shrink-0 rounded-sm px-1.5 py-px font-mono text-2xs font-semibold uppercase tracking-wider"
              [style.background-color]="badgeBg()"
              [style.color]="accentColor()"
            >{{ ext() }}</span>

            <!-- File size -->
            <span class="hidden shrink-0 font-mono text-xs text-faint tabular sm:inline">
              {{ size() }}
            </span>
          </div>

          <!-- Tool chain steps -->
          @if (steps().length) {
            <span class="truncate text-xs text-faint">
              {{ steps().join('  →  ') }}
            </span>
          }
        </div>

        <!-- Action buttons (Undo + Clear) -->
        <div class="flex shrink-0 items-center gap-1.5 md:gap-2">
          @if (undoLabel(); as label) {
            <button appButton variant="ghost" size="sm" (click)="undo()">
              <app-icon name="undo" [size]="14" />
              {{ label }}
            </button>
          }

          <button appButton variant="ghost" size="sm" (click)="clear()">
            <app-icon name="close" [size]="14" />
            {{ i18n.t()['common.clear'] }}
          </button>
        </div>
      </div>
    }
  `,
})
export class CurrentAudioFileBarComponent {
  private readonly router = inject(Router);

  protected readonly audioState = inject(AudioStateService);
  protected readonly i18n = inject(TranslationService);

  protected readonly ext = computed(() => {
    const file = this.audioState.currentFile();
    return file?.name.split('.').pop()?.toUpperCase() ?? 'AUDIO';
  });

  protected readonly size = computed(() => {
    const file = this.audioState.currentFile();
    return file ? formatBytes(file.size) : '';
  });

  protected readonly steps = computed(() =>
    this.audioState.history().map((id) => this.i18n.t()[toolById(id).navKey]),
  );

  protected readonly undoLabel = computed(() => {
    const tool = this.audioState.undoableTool();
    return tool ? `${this.i18n.t()['common.undo_tool']} ${this.i18n.t()[toolById(tool).navKey]}` : null;
  });

  private readonly tone = computed(() =>
    toneForExt(this.audioState.currentFile()?.name.split('.').pop() ?? ''),
  );

  /** The foreground colour of the active tone — used for the stripe + bars + badge text. */
  protected readonly accentColor = computed(() => `var(--tone-${this.tone()}-fg)`);

  /** The very-soft background of the active tone — the badge fill. */
  protected readonly badgeBg = computed(() => `var(--tone-${this.tone()}-bg)`);

  /**
   * A barely-there left-to-right tint of the tone colour behind the whole bar,
   * fading to the plain surface so it does not compete with the content.
   */
  protected readonly barBg = computed(
    () =>
      `linear-gradient(to right, var(--tone-${this.tone()}-bg) 0%, transparent 35%)`,
  );

  /** Reverts the last tool step and returns home so the view hydrates the previous state. */
  protected undo(): void {
    this.audioState.undo();
    void this.router.navigate(['/']);
  }

  /** Clears the audio state and returns home. */
  protected clear(): void {
    this.audioState.clear();
    void this.router.navigate(['/']);
  }
}
