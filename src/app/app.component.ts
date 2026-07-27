import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ActiveToolService } from './core/services/active-tool.service';
import { TranslationService } from './core/services/translation.service';
import { SeoService } from './core/services/seo.service';
import { CommandPaletteComponent } from './shared/ui/command-palette.component';
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
    UpdateOverlayComponent,
    ModelDownloadBarComponent,
    SplashScreenComponent,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent {
  protected readonly seo = inject(SeoService);
  protected readonly i18n = inject(TranslationService);
  protected readonly activeTool = inject(ActiveToolService);
}
