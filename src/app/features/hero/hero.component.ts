import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ImageStateService } from '../../core/services/image-state.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { MODULES, type ModuleId, type ToolDef, toolPath, toolsOfModule } from '../../core/tools/tools';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import type { IconName } from '../../shared/ui/icon/icons';
import { NetworkProofComponent } from '../../shared/ui/network-proof.component';
import { FaqComponent } from '../../shared/ui/faq.component';

/**
 * The modules the zero-upload engine expands to. Inert on purpose — no links, no
 * routes: a roadmap that looks shippable is a promise.
 */
const SOON: ReadonlyArray<{ icon: IconName; nameKey: TranslationKey; descKey: TranslationKey }> = [
  { icon: 'doc', nameKey: 'hero.soon.doc', descKey: 'hero.soon.doc_desc' },
  { icon: 'audio', nameKey: 'hero.soon.audio', descKey: 'hero.soon.audio_desc' },
];

/**
 * The home page, which is the launcher.
 *
 * It walks `MODULES` instead of holding one hand-written block per module, and
 * that is what makes it the counterpart of the scoped rail: the rail shows the
 * module you are in, this shows all of them, and a module added to `tools.ts`
 * appears in both without either template being touched. The two blocks it
 * replaced had already drifted — one titled in hardcoded Portuguese, both painted
 * with `bg-blue-500/10` and `bg-rose-500/10`, which this design system deletes, so
 * neither badge had any colour at all.
 */
@Component({
  selector: 'app-hero',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, NetworkProofComponent, FaqComponent],
  templateUrl: './hero.component.html',
})
export class HeroComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly state = inject(ImageStateService);
  protected readonly modules = MODULES;
  protected readonly soon = SOON;

  protected tools(id: ModuleId): readonly ToolDef[] {
    return toolsOfModule(id);
  }

  protected path(tool: ToolDef): string {
    const lang = this.i18n.currentLang();
    return `/${lang}/${toolPath(tool, lang)}`;
  }
}
