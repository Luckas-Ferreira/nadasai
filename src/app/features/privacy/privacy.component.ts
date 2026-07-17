import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-privacy',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <article class="mx-auto max-w-2xl py-4">
      <header class="mb-10">
        <p class="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Política de Privacidade</p>
        <h1 class="text-2xl font-semibold text-text">Seus dados são seus.</h1>
        <p class="mt-2 text-base text-muted">Última atualização: julho de 2025.</p>
      </header>

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
          Dúvidas sobre esta política? Entre em contato através do repositório do projeto no GitHub ou
          pelo e-mail disponível na página do projeto.
        </p>
      </section>

      <footer class="border-t border-line pt-6">
        <a routerLink="/" class="text-sm text-accent hover:text-accent-hover">← Voltar para o início</a>
      </footer>
    </article>
  `,
})
export class PrivacyComponent {}
