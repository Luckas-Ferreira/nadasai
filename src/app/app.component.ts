import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';
import { TranslationService, type Language } from './core/services/translation.service';
import { CurrentFileBarComponent } from './shared/ui/current-file-bar.component';
import { IconComponent } from './shared/ui/icon/icon.component';
import { SegmentedComponent } from './shared/ui/segmented.component';
import { ToolNavComponent } from './shared/ui/tool-nav.component';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    ToolNavComponent,
    CurrentFileBarComponent,
    SegmentedComponent,
    IconComponent,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly themes = inject(ThemeService);

  protected readonly languages = [
    { value: 'pt' as Language, label: 'PT' },
    { value: 'en' as Language, label: 'EN' },
  ];
}
