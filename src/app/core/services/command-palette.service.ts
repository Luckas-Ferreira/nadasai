import { Injectable, signal } from '@angular/core';

/**
 * Open/closed state for the command palette.
 *
 * It is a service and not component state because two unrelated surfaces open it:
 * the search button in the top bar, and the global keyboard shortcut. The palette
 * itself only reads this.
 */
@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
  readonly open = signal(false);

  toggle(): void {
    this.open.update((v) => !v);
  }

  show(): void {
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
  }
}

/**
 * The shortcut label, resolved once.
 *
 * Shown to the user, so it has to match the key they actually press: ⌘K on a Mac,
 * Ctrl K everywhere else. `navigator.platform` is deprecated and lies under
 * emulation, hence the userAgent test.
 */
export const PALETTE_HOTKEY_LABEL =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
    ? '⌘K'
    : 'Ctrl K';
