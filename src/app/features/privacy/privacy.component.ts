import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationService } from '../../core/services/translation.service';

@Component({
  selector: 'app-privacy',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <article class="mx-auto max-w-2xl py-4">
      <header class="mb-10">
        <p class="mb-2 text-xs font-medium uppercase tracking-wide text-faint">
          {{ i18n.currentLang() === 'pt' ? 'Política de Privacidade' : 'Privacy Policy' }}
        </p>
        <h1 class="text-2xl font-semibold text-text">
          {{ i18n.currentLang() === 'pt' ? 'Seus dados são seus.' : 'Your data is yours.' }}
        </h1>
        <p class="mt-2 text-base text-muted">
          {{ i18n.currentLang() === 'pt' ? 'Última atualização: julho de 2025.' : 'Last updated: July 2025.' }}
        </p>
      </header>

      @if (i18n.currentLang() === 'pt') {
        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">O princípio fundamental</h2>
          <p class="text-base leading-relaxed text-muted">
            O Nada Sai foi construído com uma premissa inegociável: <strong class="text-text">nenhum arquivo seu
            trafega pela internet</strong>. Todo o processamento — incluindo a IA de remoção de fundo — acontece
            localmente no seu navegador. Suas imagens nunca chegam a nenhum servidor nosso.
          </p>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">O que não coletamos</h2>
          <ul class="space-y-2 text-base text-muted">
            <li class="flex items-start gap-2">
              <span class="mt-1 text-success">✓</span>
              <span>Não coletamos suas imagens ou arquivos de nenhuma forma.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 text-success">✓</span>
              <span>Não rastreamos o conteúdo das suas edições.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 text-success">✓</span>
              <span>Não vendemos, compartilhamos ou transferimos seus dados para terceiros.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 text-success">✓</span>
              <span>Não exigimos cadastro, login ou qualquer informação pessoal.</span>
            </li>
          </ul>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">O que pode ser coletado</h2>
          <p class="mb-4 text-base leading-relaxed text-muted">
            Como qualquer site na internet, nosso servidor de hospedagem pode registrar automaticamente dados
            técnicos básicos, como endereço IP, tipo de navegador, sistema operacional e páginas acessadas.
            Esses registros são usados exclusivamente para fins de segurança e diagnóstico da infraestrutura,
            não para identificar ou rastrear usuários individualmente.
          </p>
          <p class="text-base leading-relaxed text-muted">
            O modelo de IA é baixado do nosso servidor na primeira utilização e armazenado em cache no seu
            dispositivo. Esse download registra uma requisição HTTP padrão nos logs do servidor, sem nenhum
            dado pessoal associado.
          </p>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">Armazenamento local</h2>
          <p class="text-base leading-relaxed text-muted">
            O aplicativo pode usar <code class="rounded bg-raised px-1 text-xs">localStorage</code> e
            <code class="rounded bg-raised px-1 text-xs">sessionStorage</code> do navegador para guardar
            preferências de sessão (como o idioma selecionado). Esses dados ficam exclusivamente no seu
            dispositivo e nunca são transmitidos.
          </p>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">Cookies</h2>
          <p class="text-base leading-relaxed text-muted">
            O Nada Sai não utiliza cookies de rastreamento, publicidade ou análise. Nenhum cookie de
            terceiros é instalado no seu navegador.
          </p>
        </section>

        <section class="mb-10">
          <h2 class="mb-3 text-lg font-semibold text-text">Contato</h2>
          <p class="text-base leading-relaxed text-muted">
            Dúvidas sobre esta política? Entre em contato pelo e-mail suporte&#64;jluckas.com.br.
          </p>
        </section>
      } @else {
        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">The core principle</h2>
          <p class="text-base leading-relaxed text-muted">
            Nada Sai was built on a non-negotiable premise: <strong class="text-text">none of your files
            travel across the internet</strong>. All processing — including the AI background removal — happens
            locally in your browser. Your images never reach our servers.
          </p>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">What we don't collect</h2>
          <ul class="space-y-2 text-base text-muted">
            <li class="flex items-start gap-2">
              <span class="mt-1 text-success">✓</span>
              <span>We do not collect your images or files in any way.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 text-success">✓</span>
              <span>We do not track the content of your edits.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 text-success">✓</span>
              <span>We do not sell, share, or transfer your data to third parties.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 text-success">✓</span>
              <span>We do not require registration, login, or any personal information.</span>
            </li>
          </ul>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">What might be collected</h2>
          <p class="mb-4 text-base leading-relaxed text-muted">
            Like any website on the internet, our hosting server may automatically record basic
            technical data, such as IP address, browser type, operating system, and pages accessed.
            These logs are used exclusively for infrastructure security and diagnostic purposes,
            not to identify or track users individually.
          </p>
          <p class="text-base leading-relaxed text-muted">
            The AI model is downloaded from our server upon first use and cached on your
            device. This download logs a standard HTTP request on the server without any
            personal data attached.
          </p>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">Local Storage</h2>
          <p class="text-base leading-relaxed text-muted">
            The application may use the browser's <code class="rounded bg-raised px-1 text-xs">localStorage</code> and
            <code class="rounded bg-raised px-1 text-xs">sessionStorage</code> to save
            session preferences (like the selected language). This data stays exclusively on your
            device and is never transmitted.
          </p>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">Cookies</h2>
          <p class="text-base leading-relaxed text-muted">
            Nada Sai does not use tracking, advertising, or analytics cookies. No third-party
            cookies are installed in your browser.
          </p>
        </section>

        <section class="mb-10">
          <h2 class="mb-3 text-lg font-semibold text-text">Contact</h2>
          <p class="text-base leading-relaxed text-muted">
            Questions about this policy? Contact us at suporte&#64;jluckas.com.br.
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
export class PrivacyComponent {
  i18n = inject(TranslationService);
}
