import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../core/services/translation.service';
import { IconComponent } from './icon/icon.component';

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <section class="mt-16 mb-12 w-full border-t border-line/80 pt-12">
      <div class="mx-auto max-w-3xl text-center">
        <div class="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3.5 py-1.5 text-xs font-bold text-accent border border-accent/20 mb-3.5 shadow-2xs">
          <app-icon name="check" [size]="14" />
          <span>FAQ & Segurança</span>
        </div>
        <h2 class="text-2xl font-extrabold tracking-tight text-text md:text-3xl" style="color: #0f172a !important;">
          {{ i18n.t()['faq.title'] }}
        </h2>
        <p class="mt-2.5 text-sm text-muted leading-relaxed font-medium" style="color: #334155 !important;">
          {{ i18n.t()['faq.subtitle'] }}
        </p>
      </div>

      <div class="mx-auto mt-8 max-w-3xl space-y-4">
        @for (item of faqs; track item.qKey) {
          <details
            class="group rounded-xl border border-line-strong bg-surface p-5 shadow-sm transition-all duration-200 hover:border-accent hover:shadow-md [&[open]]:border-accent [&[open]]:border-l-4 [&[open]]:border-l-accent [&[open]]:bg-raised/60"
          >
            <summary class="flex cursor-pointer items-center justify-between text-text select-none list-none [&::-webkit-details-marker]:hidden">
              <span class="pr-4 text-base md:text-lg font-bold leading-snug" style="color: #0f172a !important;">
                {{ i18n.t()[item.qKey] }}
              </span>
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-accent transition-transform duration-200 group-open:rotate-180 group-open:bg-accent-soft">
                <app-icon name="chevronDown" [size]="18" />
              </span>
            </summary>
            <div class="mt-3.5 border-t border-line/80 pt-3.5 text-sm md:text-base leading-relaxed font-normal" style="color: #334155 !important;">
              {{ i18n.t()[item.aKey] }}
            </div>
          </details>
        }
      </div>
    </section>
  `
})
export class FaqComponent {
  protected i18n = inject(TranslationService);

  protected faqs = [
    { qKey: 'faq.q1', aKey: 'faq.a1' },
    { qKey: 'faq.q2', aKey: 'faq.a2' },
    { qKey: 'faq.q3', aKey: 'faq.a3' },
    { qKey: 'faq.q4', aKey: 'faq.a4' },
    { qKey: 'faq.q5', aKey: 'faq.a5' }
  ] as const;
}
