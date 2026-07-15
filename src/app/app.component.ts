import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslationService, type Language } from './core/services/translation.service';
import { TOOLS } from './core/tools/tools';
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
    RouterLinkActive,
    ToolNavComponent,
    CurrentFileBarComponent,
    SegmentedComponent,
    IconComponent,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly tools = TOOLS;

  protected readonly languages = [
    { value: 'pt' as Language, label: 'PT' },
    { value: 'en' as Language, label: 'EN' },
  ];
}
