import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { ActiveToolService } from './core/services/active-tool.service';
import { GlobalErrorService } from './core/errors/global-error-handler';
import { WorkspaceService } from './core/services/workspace.service';
import { SeoService } from './core/services/seo.service';
import { TranslationService } from './core/services/translation.service';
import { AlertComponent } from './shared/ui/alert.component';
import { CommandPaletteComponent } from './shared/ui/command-palette.component';
import { FileBarComponent } from './shared/ui/file-bar.component';
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
    FileBarComponent,
    UpdateOverlayComponent,
    ModelDownloadBarComponent,
    SplashScreenComponent,
    AlertComponent,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent {
  private readonly router = inject(Router);
  protected readonly seo = inject(SeoService);
  protected readonly i18n = inject(TranslationService);
  protected readonly activeTool = inject(ActiveToolService);
  protected readonly workspace = inject(WorkspaceService);
  protected readonly globalError = inject(GlobalErrorService);

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

    // Uma sessão só, então uma checagem só. Eram duas porque eram dois
    // serviços, e o `else if` decidia em silêncio que o áudio ganhava do
    // imagem quando as duas cadeias estavam vivas ao mesmo tempo.
    if (!this.workspace.undoableTool()) return;

    event.preventDefault();
    this.workspace.undo();
  }
}
