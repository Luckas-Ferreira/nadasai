import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { TOOLS } from '../../core/tools/tools';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import type { IconName } from '../../shared/ui/icon/icons';
import { NetworkProofComponent } from '../../shared/ui/network-proof.component';

/**
 * The modules the zero-upload engine expands to.
 */
const SOON: ReadonlyArray<{ icon: IconName; nameKey: TranslationKey; descKey: TranslationKey }> = [
  { icon: 'doc', nameKey: 'hero.soon.doc', descKey: 'hero.soon.doc_desc' },
  { icon: 'audio', nameKey: 'hero.soon.audio', descKey: 'hero.soon.audio_desc' },
];

@Component({
  selector: 'app-hero',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    NetworkProofComponent,
  ],
  templateUrl: './hero.component.html',
})
export class HeroComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly tools = TOOLS;
  protected readonly imageTools = TOOLS.filter((t) => t.category === 'image');
  protected readonly pdfTools = TOOLS.filter((t) => t.category === 'pdf');
  protected readonly soon = SOON;
}
