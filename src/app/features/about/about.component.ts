import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

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
        <h1 class="text-2xl font-semibold text-text">Sobre o Nada Sai</h1>
        <p class="mt-2 text-base text-muted">Uma ferramenta de edição de imagens que respeita sua privacidade.</p>
      </header>

      <section class="mb-8">
        <h2 class="mb-3 text-lg font-semibold text-text">O que é o Nada Sai?</h2>
        <p class="text-base leading-relaxed text-muted">
          O <strong class="text-text">Nada Sai</strong> é um conjunto de ferramentas de edição de imagens que roda
          inteiramente no seu navegador. Remova fundos, corte, comprima, converta e redimensione imagens — tudo
          sem enviar um único byte para qualquer servidor.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-3 text-lg font-semibold text-text">Como funciona?</h2>
        <p class="mb-4 text-base leading-relaxed text-muted">
          Cada operação, inclusive a remoção de fundo com inteligência artificial, é executada diretamente no
          seu computador usando tecnologias modernas do navegador: WebAssembly, Web Workers e WebGPU quando
          disponível. O modelo de IA é baixado uma única vez e fica armazenado localmente.
        </p>
        <p class="text-base leading-relaxed text-muted">
          Isso significa que suas imagens nunca trafegam pela internet — elas saem do seu disco, passam pelo
          processador do seu computador e voltam para você. Daí o nome: <em>nada sai</em>.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-3 text-lg font-semibold text-text">Ferramentas disponíveis</h2>
        <ul class="space-y-2 text-base text-muted">
          <li class="flex items-start gap-2">
            <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
            <span><strong class="text-text">Remover fundo</strong> — IA local separa o sujeito do plano de fundo.</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
            <span><strong class="text-text">Cortar</strong> — recorte com proporções livres ou predefinidas.</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
            <span><strong class="text-text">Comprimir</strong> — reduza o tamanho do arquivo sem perder qualidade visível.</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
            <span><strong class="text-text">Converter</strong> — transforme entre JPEG, PNG, WebP e AVIF.</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
            <span><strong class="text-text">Redimensionar</strong> — altere as dimensões mantendo ou não a proporção.</span>
          </li>
        </ul>
      </section>

      <section class="mb-10">
        <h2 class="mb-3 text-lg font-semibold text-text">Código aberto</h2>
        <p class="text-base leading-relaxed text-muted">
          O Nada Sai é um projeto de código aberto. Você pode auditar, contribuir ou fazer um fork livremente.
          A transparência é parte do compromisso com a privacidade — você não precisa confiar na nossa palavra,
          pode ler o código.
        </p>
      </section>

      <footer class="border-t border-line pt-6">
        <a routerLink="/" class="text-sm text-accent hover:text-accent-hover">← Voltar para o início</a>
      </footer>
    </article>
  `,
})
export class AboutComponent {}
