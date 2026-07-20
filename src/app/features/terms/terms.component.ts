import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationService } from '../../core/services/translation.service';

@Component({
  selector: 'app-terms',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <article class="mx-auto max-w-2xl py-4">
      <header class="mb-10">
        <p class="mb-2 text-xs font-medium uppercase tracking-wide text-faint">
          {{ i18n.currentLang() === 'pt' ? 'Termos de Uso' : 'Terms of Use' }}
        </p>
        <h1 class="text-2xl font-semibold text-text">
          {{ i18n.currentLang() === 'pt' ? 'Termos de Uso' : 'Terms of Use' }}
        </h1>
        <p class="mt-2 text-base text-muted">
          {{ i18n.currentLang() === 'pt' ? 'Última atualização: julho de 2025.' : 'Last updated: July 2025.' }}
        </p>
      </header>

      @if (i18n.currentLang() === 'pt') {
        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">1. Aceitação dos termos</h2>
          <p class="text-base leading-relaxed text-muted">
            Ao acessar e usar o Nada Sai, você concorda com estes Termos de Uso. Se não concordar com
            qualquer parte destes termos, por favor, não utilize o serviço.
          </p>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">2. Descrição do serviço</h2>
          <p class="text-base leading-relaxed text-muted">
            O Nada Sai é uma plataforma gratuita de edição de imagens que opera inteiramente no navegador
            do usuário. O serviço inclui ferramentas de remoção de fundo, corte, compressão, conversão e
            redimensionamento de imagens, sem armazenamento ou transmissão de arquivos a servidores.
          </p>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">3. Uso permitido</h2>
          <p class="mb-3 text-base leading-relaxed text-muted">Você pode usar o Nada Sai para:</p>
          <ul class="mb-4 space-y-2 text-base text-muted">
            <li class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
              <span>Processar imagens pessoais ou profissionais de sua propriedade ou para as quais você possui autorização.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
              <span>Fins comerciais e não-comerciais, desde que respeitadas as demais cláusulas.</span>
            </li>
          </ul>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">4. Uso proibido</h2>
          <p class="mb-3 text-base leading-relaxed text-muted">É expressamente proibido usar o Nada Sai para:</p>
          <ul class="space-y-2 text-base text-muted">
            <li class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-danger"></span>
              <span>Processar imagens de terceiros sem autorização.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-danger"></span>
              <span>Criar, distribuir ou manipular imagens com fins de desinformação, difamação ou fraude.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-danger"></span>
              <span>Qualquer atividade que viole leis aplicáveis, incluindo legislação de direitos autorais e proteção de dados.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-danger"></span>
              <span>Tentativas de engenharia reversa, extração ou replicação do modelo de IA incluído no serviço.</span>
            </li>
          </ul>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">5. Propriedade intelectual</h2>
          <p class="text-base leading-relaxed text-muted">
            Os modelos de IA utilizados no Nada Sai possuem suas próprias licenças e termos de uso definidos pelos
            seus criadores. Você mantém todos e quaisquer direitos sobre as imagens que processa através do serviço,
            sendo o único responsável por elas.
          </p>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">6. Isenção de responsabilidade</h2>
          <p class="text-base leading-relaxed text-muted">
            O serviço é fornecido "como está", sem garantias de qualquer tipo. Não nos responsabilizamos
            por danos diretos ou indiretos resultantes do uso ou da impossibilidade de uso do serviço,
            incluindo perda de dados, resultados insatisfatórios do processamento de IA ou interrupções
            do serviço.
          </p>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">7. Modificações</h2>
          <p class="text-base leading-relaxed text-muted">
            Reservamo-nos o direito de modificar estes termos a qualquer momento. Alterações significativas
            serão comunicadas através do site. O uso continuado do serviço após as modificações constitui
            aceitação dos novos termos.
          </p>
        </section>

        <section class="mb-10">
          <h2 class="mb-3 text-lg font-semibold text-text">8. Lei aplicável</h2>
          <p class="text-base leading-relaxed text-muted">
            Estes termos são regidos pela legislação brasileira. Qualquer disputa será resolvida no foro
            da comarca competente, com renúncia a qualquer outro, por mais privilegiado que seja.
          </p>
        </section>
      } @else {
        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">1. Acceptance of terms</h2>
          <p class="text-base leading-relaxed text-muted">
            By accessing and using Nada Sai, you agree to these Terms of Use. If you do not agree with
            any part of these terms, please do not use the service.
          </p>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">2. Service description</h2>
          <p class="text-base leading-relaxed text-muted">
            Nada Sai is a free image editing platform that operates entirely within the user's
            browser. The service includes background removal, cropping, compressing, converting, and
            resizing tools, with no file storage or transmission to servers.
          </p>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">3. Permitted use</h2>
          <p class="mb-3 text-base leading-relaxed text-muted">You may use Nada Sai to:</p>
          <ul class="mb-4 space-y-2 text-base text-muted">
            <li class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
              <span>Process personal or professional images you own or have permission to use.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
              <span>Commercial and non-commercial purposes, provided you comply with other clauses.</span>
            </li>
          </ul>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">4. Prohibited use</h2>
          <p class="mb-3 text-base leading-relaxed text-muted">It is strictly prohibited to use Nada Sai to:</p>
          <ul class="space-y-2 text-base text-muted">
            <li class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-danger"></span>
              <span>Process third-party images without authorization.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-danger"></span>
              <span>Create, distribute, or manipulate images for misinformation, defamation, or fraud.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-danger"></span>
              <span>Any activity that violates applicable laws, including copyright and data protection laws.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-danger"></span>
              <span>Attempt to reverse engineer, extract, or replicate the AI model included in the service.</span>
            </li>
          </ul>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">5. Intellectual property</h2>
          <p class="text-base leading-relaxed text-muted">
            The AI models used in Nada Sai have their own licenses and terms of use set by their
            creators. You retain any and all rights to the images you process through the service,
            and you are solely responsible for them.
          </p>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">6. Disclaimer</h2>
          <p class="text-base leading-relaxed text-muted">
            The service is provided "as is", without warranty of any kind. We are not liable
            for direct or indirect damages resulting from the use or inability to use the service,
            including data loss, unsatisfactory AI processing results, or service interruptions.
          </p>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">7. Modifications</h2>
          <p class="text-base leading-relaxed text-muted">
            We reserve the right to modify these terms at any time. Significant changes will be
            communicated via the website. Continued use of the service after modifications constitutes
            acceptance of the new terms.
          </p>
        </section>

        <section class="mb-10">
          <h2 class="mb-3 text-lg font-semibold text-text">8. Applicable law</h2>
          <p class="text-base leading-relaxed text-muted">
            These terms are governed by Brazilian law. Any dispute will be resolved in the competent
            court, waiving any other, however privileged it may be.
          </p>
        </section>
      }

      <footer class="border-t border-line pt-6">
        <a [routerLink]="'/' + i18n.currentLang()" class="text-sm text-accent hover:text-accent-hover">
          {{ i18n.currentLang() === 'pt' ? '← Voltar para o início' : '← Back to Home' }}
        </a>
      </footer>
    </article>
  `,
})
export class TermsComponent {
  i18n = inject(TranslationService);
}
