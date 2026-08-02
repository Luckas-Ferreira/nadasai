import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { ActiveToolService } from './core/services/active-tool.service';
import { AudioStateService } from './core/services/audio-state.service';
import { ImageStateService } from './core/services/image-state.service';
import { SeoService } from './core/services/seo.service';
import { TranslationService } from './core/services/translation.service';
import { CommandPaletteComponent } from './shared/ui/command-palette.component';
import { CurrentAudioFileBarComponent } from './shared/ui/current-audio-file-bar.component';
import { CurrentFileBarComponent } from './shared/ui/current-file-bar.component';
import { MobileToolBarComponent } from './shared/ui/mobile-tool-bar.component';
import { ModelDownloadBarComponent } from './shared/ui/model-download-bar.component';
import { SplashScreenComponent } from './shared/ui/splash-screen.component';
import { ToolNavComponent } from './shared/ui/tool-nav.component';
import { TopBarComponent } from './shared/ui/top-bar.component';
import { UpdateOverlayComponent } from './shared/ui/update-overlay.component';

/**
 * The shell.
 *
 * It owns the frame and nothing else: which surfaces exist and where they sit.
 * What each of them lists comes from `ActiveToolService` — the rail and the mobile
 * bar resolve the current module themselves, so adding a module never touches
 * this file. That is why `TOOLS` and the per-category filters are gone from here.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    TopBarComponent,
    ToolNavComponent,
    MobileToolBarComponent,
    CommandPaletteComponent,
    CurrentFileBarComponent,
    CurrentAudioFileBarComponent,
    UpdateOverlayComponent,
    ModelDownloadBarComponent,
    SplashScreenComponent,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent {
  private readonly router = inject(Router);
  protected readonly seo = inject(SeoService);
  protected readonly i18n = inject(TranslationService);
  protected readonly activeTool = inject(ActiveToolService);
  protected readonly imageState = inject(ImageStateService);
  protected readonly audioState = inject(AudioStateService);

  /** Global Ctrl+Z / Cmd+Z shortcut to trigger undo on the active state session. */
  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;

    // Do not trigger undo when typing in input fields or textareas
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }

    if (this.audioState.undoableTool()) {
      event.preventDefault();
      this.audioState.undo();
      void this.router.navigate(['/']);
    } else if (this.imageState.undoableTool()) {
      event.preventDefault();
      this.imageState.undo();
      void this.router.navigate(['/']);
    }
  }
}
