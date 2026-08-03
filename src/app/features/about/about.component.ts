import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationService } from '../../core/services/translation.service';

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
        <h1 class="text-2xl font-semibold text-text">
          {{ i18n.currentLang() === 'pt' ? 'Sobre o Nada Sai' : 'About Nada Sai' }}
        </h1>
        <p class="mt-2 text-base text-muted">
          {{ i18n.currentLang() === 'pt' ? 'Uma ferramenta de edição de imagens que respeita sua privacidade.' : 'An image editing tool that respects your privacy.' }}
        </p>
      </header>

      @if (i18n.currentLang() === 'pt') {
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
              <!-- NÃO citar AVIF como saída: canvas.toBlob('image/avif') não é
                   suportado e, pela especificação, cai silenciosamente para PNG
                   em vez de falhar — o app já entregou bytes PNG dentro de um
                   arquivo .avif por causa disso. AVIF continua aceito na
                   ENTRADA. -->
              <span><strong class="text-text">Converter</strong> — transforme entre JPEG, PNG e WebP (AVIF entra, mas não sai).</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
              <span><strong class="text-text">Redimensionar</strong> — altere as dimensões mantendo ou não a proporção.</span>
            </li>
          </ul>
        </section>

        <section class="mb-10">
          <h2 class="mb-3 text-lg font-semibold text-text">Autor</h2>
          <p class="text-base leading-relaxed text-muted">
            O Nada Sai foi desenvolvido por <a href="https://jluckas.com.br" target="_blank" rel="noopener noreferrer" class="text-accent underline hover:text-accent-hover">jluckas.com.br</a>.
          </p>
        </section>
      } @else {
        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">What is Nada Sai?</h2>
          <p class="text-base leading-relaxed text-muted">
            <strong class="text-text">Nada Sai</strong> (which translates to "Nothing Leaves") is a set of image editing tools that runs
            entirely in your browser. Remove backgrounds, crop, compress, convert, and resize images — all
            without sending a single byte to any server.
          </p>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">How does it work?</h2>
          <p class="mb-4 text-base leading-relaxed text-muted">
            Every operation, including AI background removal, is executed directly on
            your computer using modern browser technologies: WebAssembly, Web Workers, and WebGPU when
            available. The AI model is downloaded once and stored locally.
          </p>
          <p class="text-base leading-relaxed text-muted">
            This means your images never travel through the internet — they leave your disk, pass through
            your computer's processor, and come right back to you. Hence the name: <em>nada sai</em>.
          </p>
        </section>

        <section class="mb-8">
          <h2 class="mb-3 text-lg font-semibold text-text">Available tools</h2>
          <ul class="space-y-2 text-base text-muted">
            <li class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
              <span><strong class="text-text">Remove background</strong> — Local AI separates the subject from the background.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
              <span><strong class="text-text">Crop</strong> — Crop with free or predefined ratios.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
              <span><strong class="text-text">Compress</strong> — Reduce file size without visible quality loss.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
              <span><strong class="text-text">Convert</strong> — Transform between JPEG, PNG and WebP (AVIF goes in, but not out).</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
              <span><strong class="text-text">Resize</strong> — Change dimensions keeping the aspect ratio or not.</span>
            </li>
          </ul>
        </section>

        <section class="mb-10">
          <h2 class="mb-3 text-lg font-semibold text-text">Author</h2>
          <p class="text-base leading-relaxed text-muted">
            Nada Sai was developed by <a href="https://jluckas.com.br" target="_blank" rel="noopener noreferrer" class="text-accent underline hover:text-accent-hover">jluckas.com.br</a>.
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
export class AboutComponent {
  i18n = inject(TranslationService);
}
