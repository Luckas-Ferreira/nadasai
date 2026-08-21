import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationService } from '../../core/services/translation.service';

/**
 * Marcação única, texto no dicionário — mesmo motivo do `about`: as duas metades
 * escritas à mão são dois documentos para manter em dia, e este aqui é um
 * documento que descreve uma garantia. Uma política de privacidade que descreve
 * o produto errado é pior do que uma página desatualizada qualquer.
 *
 * A seção "e dá para conferir" é nova e não é enfeite: `NetworkProbeService` e a
 * CSP existem, medem e barram: a política agora diz onde olhar em vez de pedir
 * confiança.
 */
@Component({
  selector: 'app-privacy',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <article class="mx-auto max-w-2xl py-4">
      <header class="mb-10">
        <h1 class="text-2xl font-semibold text-text">{{ i18n.t()['privacy.title'] }}</h1>
        <p class="mt-2 text-base text-muted">{{ i18n.t()['privacy.subtitle'] }}</p>
        <p class="mt-1 text-sm text-faint">{{ i18n.t()['privacy.updated'] }}</p>
      </header>

      <section class="mb-8">
        <h2 class="mb-3 text-lg font-semibold text-text">{{ i18n.t()['privacy.principle_h'] }}</h2>
        <p class="text-base leading-relaxed text-muted">{{ i18n.t()['privacy.principle_p'] }}</p>
      </section>

      <section class="mb-8">
        <h2 class="mb-3 text-lg font-semibold text-text">{{ i18n.t()['privacy.proof_h'] }}</h2>
        <p class="text-base leading-relaxed text-muted">{{ i18n.t()['privacy.proof_p'] }}</p>
      </section>

      <section class="mb-8">
        <h2 class="mb-3 text-lg font-semibold text-text">{{ i18n.t()['privacy.nocollect_h'] }}</h2>
        <ul class="space-y-2 text-base text-muted">
          @for (item of notCollected(); track item) {
            <li class="flex items-start gap-2">
              <span class="mt-1 text-success" aria-hidden="true">✓</span>
              <span>{{ item }}</span>
            </li>
          }
        </ul>
      </section>

      <section class="mb-8">
        <h2 class="mb-3 text-lg font-semibold text-text">{{ i18n.t()['privacy.collect_h'] }}</h2>
        <p class="mb-4 text-base leading-relaxed text-muted">{{ i18n.t()['privacy.collect_p1'] }}</p>
        <p class="text-base leading-relaxed text-muted">{{ i18n.t()['privacy.collect_p2'] }}</p>
      </section>

      <section class="mb-8">
        <h2 class="mb-3 text-lg font-semibold text-text">{{ i18n.t()['privacy.storage_h'] }}</h2>
        <p class="text-base leading-relaxed text-muted">{{ i18n.t()['privacy.storage_p'] }}</p>
      </section>

      <section class="mb-8">
        <h2 class="mb-3 text-lg font-semibold text-text">{{ i18n.t()['privacy.cookies_h'] }}</h2>
        <p class="text-base leading-relaxed text-muted">{{ i18n.t()['privacy.cookies_p'] }}</p>
      </section>

      <section class="mb-10">
        <h2 class="mb-3 text-lg font-semibold text-text">{{ i18n.t()['privacy.contact_h'] }}</h2>
        <p class="text-base leading-relaxed text-muted">
          {{ i18n.t()['privacy.contact_p'] }} {{ i18n.t()['static.contact_email'] }}.
        </p>
      </section>

      <footer class="border-t border-line pt-6">
        <a [routerLink]="'/' + i18n.currentLang()" class="text-sm text-accent hover:text-accent-hover">
          {{ i18n.t()['static.back_home'] }}
        </a>
      </footer>
    </article>
  `,
})
export class PrivacyComponent {
  readonly i18n = inject(TranslationService);

  protected readonly notCollected = computed(() => {
    const t = this.i18n.t();
    return [
      t['privacy.nocollect_1'],
      t['privacy.nocollect_2'],
      t['privacy.nocollect_3'],
      t['privacy.nocollect_4'],
    ];
  });
}
