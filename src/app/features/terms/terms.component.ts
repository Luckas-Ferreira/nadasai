import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationService } from '../../core/services/translation.service';

/**
 * Marcação única, texto no dicionário — ver o cabeçalho do `about`.
 *
 * Aqui a deriva era a mais séria das três: a cláusula 2 definia o serviço como
 * "uma plataforma gratuita de edição de imagens" e as cláusulas 3 e 4 falavam só
 * de imagens, o que deixava PDF, áudio, vídeo e o módulo de privacidade fora do
 * escopo do documento que rege o uso deles. "Imagem" virou "arquivo" onde o
 * termo era a definição do serviço, e não onde ele descreve uma ferramenta.
 *
 * A cláusula 7 é nova e existe porque decorre do produto: processamento local
 * quer dizer que não há cópia do outro lado e que uma senha de arquivo
 * criptografado não tem como ser redefinida — o `envelope.ts` não guarda nada
 * que permita isso, de propósito. Vale dizer antes, e não na hora.
 */
@Component({
  selector: 'app-terms',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <article class="mx-auto max-w-2xl py-4">
      <header class="mb-10">
        <h1 class="text-2xl font-semibold text-text">{{ i18n.t()['terms.title'] }}</h1>
        <p class="mt-2 text-base text-muted">{{ i18n.t()['terms.subtitle'] }}</p>
        <p class="mt-1 text-sm text-faint">{{ i18n.t()['terms.updated'] }}</p>
      </header>

      <section class="mb-8">
        <h2 class="mb-3 text-lg font-semibold text-text">{{ i18n.t()['terms.s1_h'] }}</h2>
        <p class="text-base leading-relaxed text-muted">{{ i18n.t()['terms.s1_p'] }}</p>
      </section>

      <section class="mb-8">
        <h2 class="mb-3 text-lg font-semibold text-text">{{ i18n.t()['terms.s2_h'] }}</h2>
        <p class="text-base leading-relaxed text-muted">{{ i18n.t()['terms.s2_p'] }}</p>
      </section>

      <section class="mb-8">
        <h2 class="mb-3 text-lg font-semibold text-text">{{ i18n.t()['terms.s3_h'] }}</h2>
        <p class="mb-3 text-base leading-relaxed text-muted">{{ i18n.t()['terms.s3_lead'] }}</p>
        <ul class="mb-4 space-y-2 text-base text-muted">
          @for (item of allowed(); track item) {
            <li class="flex items-start gap-2">
              <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
              <span>{{ item }}</span>
            </li>
          }
        </ul>
      </section>

      <section class="mb-8">
        <h2 class="mb-3 text-lg font-semibold text-text">{{ i18n.t()['terms.s4_h'] }}</h2>
        <p class="mb-3 text-base leading-relaxed text-muted">{{ i18n.t()['terms.s4_lead'] }}</p>
        <ul class="space-y-2 text-base text-muted">
          @for (item of forbidden(); track item) {
            <li class="flex items-start gap-2">
              <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-danger"></span>
              <span>{{ item }}</span>
            </li>
          }
        </ul>
      </section>

      @for (s of clauses(); track s.h) {
        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">{{ s.h }}</h2>
          <p class="text-base leading-relaxed text-muted">{{ s.p }}</p>
        </section>
      }

      <footer class="border-t border-line pt-6">
        <a [routerLink]="'/' + i18n.currentLang()" class="text-sm text-accent hover:text-accent-hover">
          {{ i18n.t()['static.back_home'] }}
        </a>
      </footer>
    </article>
  `,
})
export class TermsComponent {
  readonly i18n = inject(TranslationService);

  protected readonly allowed = computed(() => {
    const t = this.i18n.t();
    return [t['terms.s3_1'], t['terms.s3_2']];
  });

  protected readonly forbidden = computed(() => {
    const t = this.i18n.t();
    return [t['terms.s4_1'], t['terms.s4_2'], t['terms.s4_3'], t['terms.s4_4']];
  });

  /** As cláusulas 5 a 9 são todas cabeçalho + um parágrafo. */
  protected readonly clauses = computed(() => {
    const t = this.i18n.t();
    return [
      { h: t['terms.s5_h'], p: t['terms.s5_p'] },
      { h: t['terms.s6_h'], p: t['terms.s6_p'] },
      { h: t['terms.s7_h'], p: t['terms.s7_p'] },
      { h: t['terms.s8_h'], p: t['terms.s8_p'] },
      { h: t['terms.s9_h'], p: t['terms.s9_p'] },
    ];
  });
}
