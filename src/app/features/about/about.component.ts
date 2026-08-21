import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationService } from '../../core/services/translation.service';

/**
 * Marcação ÚNICA, texto no dicionário.
 *
 * Esta página era um `@if pt { … } @else { … }` com as duas metades escritas à
 * mão, e foi assim que ela envelheceu: descrevia "um conjunto de ferramentas de
 * edição de imagens", listava cinco, e ficou nisso enquanto o produto virava 38
 * ferramentas em cinco módulos. Duas cópias de um texto são dois documentos para
 * manter em dia; uma chave de dicionário não tem como divergir da tradução dela.
 *
 * A lista de módulos é derivada de chaves e não de `MODULES`/`TOOLS` de
 * propósito: aqui o que se quer é a FRASE que descreve o módulo para quem está
 * decidindo se usa o produto, e não o rótulo de navegação — são textos com
 * públicos diferentes, e amarrá-los produziria uma página feita de menu.
 */
@Component({
  selector: 'app-about',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <article class="mx-auto max-w-2xl py-4">
      <header class="mb-10">
        <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-accent-soft">
          <img src="logo_nadasai.svg" alt="" class="h-8 w-8 object-contain" />
        </div>
        <h1 class="text-2xl font-semibold text-text">{{ i18n.t()['about.title'] }}</h1>
        <p class="mt-2 text-base text-muted">{{ i18n.t()['about.subtitle'] }}</p>
      </header>

      <section class="mb-8">
        <h2 class="mb-3 text-lg font-semibold text-text">{{ i18n.t()['about.what_h'] }}</h2>
        <p class="text-base leading-relaxed text-muted">{{ i18n.t()['about.what_p'] }}</p>
      </section>

      <section class="mb-8">
        <h2 class="mb-3 text-lg font-semibold text-text">{{ i18n.t()['about.how_h'] }}</h2>
        <p class="mb-4 text-base leading-relaxed text-muted">{{ i18n.t()['about.how_p1'] }}</p>
        <p class="text-base leading-relaxed text-muted">{{ i18n.t()['about.how_p2'] }}</p>
      </section>

      <section class="mb-8">
        <h2 class="mb-3 text-lg font-semibold text-text">{{ i18n.t()['about.modules_h'] }}</h2>
        <ul class="space-y-2 text-base text-muted">
          @for (mod of modules(); track mod.name) {
            <li class="flex items-start gap-2">
              <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
              <span><strong class="text-text">{{ mod.name }}</strong> — {{ mod.desc }}</span>
            </li>
          }
        </ul>
      </section>

      <section class="mb-8">
        <h2 class="mb-3 text-lg font-semibold text-text">{{ i18n.t()['about.ai_h'] }}</h2>
        <p class="text-base leading-relaxed text-muted">{{ i18n.t()['about.ai_p'] }}</p>
      </section>

      <section class="mb-10">
        <h2 class="mb-3 text-lg font-semibold text-text">{{ i18n.t()['about.author_h'] }}</h2>
        <p class="text-base leading-relaxed text-muted">
          {{ i18n.t()['about.author_p'] }}
          <a
            href="https://jluckas.com.br"
            target="_blank"
            rel="noopener noreferrer"
            class="text-accent underline hover:text-accent-hover"
            >{{ i18n.t()['static.author_site'] }}</a
          >.
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
export class AboutComponent {
  readonly i18n = inject(TranslationService);

  protected readonly modules = computed(() => {
    const t = this.i18n.t();
    return [
      { name: t['about.mod_image'], desc: t['about.mod_image_d'] },
      { name: t['about.mod_pdf'], desc: t['about.mod_pdf_d'] },
      { name: t['about.mod_audio'], desc: t['about.mod_audio_d'] },
      { name: t['about.mod_video'], desc: t['about.mod_video_d'] },
      { name: t['about.mod_privacy'], desc: t['about.mod_privacy_d'] },
    ];
  });
}
