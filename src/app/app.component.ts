import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslationService } from './core/services/translation.service';
import { TOOLS } from './core/tools/tools';
import { CurrentFileBarComponent } from './shared/ui/current-file-bar.component';
import { IconComponent } from './shared/ui/icon/icon.component';
import { ModelDownloadBarComponent } from './shared/ui/model-download-bar.component';
import { ToolNavComponent } from './shared/ui/tool-nav.component';
import { UpdateOverlayComponent } from './shared/ui/update-overlay.component';
import { SplashScreenComponent } from './shared/ui/splash-screen.component';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ToolNavComponent,
    CurrentFileBarComponent,
    IconComponent,
    UpdateOverlayComponent,
    ModelDownloadBarComponent,
    SplashScreenComponent,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly tools = TOOLS;
}
