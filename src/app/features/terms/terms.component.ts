import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-terms',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <article class="mx-auto max-w-2xl py-4">
      <header class="mb-10">
        <p class="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Termos de Uso</p>
        <h1 class="text-2xl font-semibold text-text">Termos de Uso</h1>
        <p class="mt-2 text-base text-muted">Última atualização: julho de 2025.</p>
      </header>

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
          O código-fonte do Nada Sai é disponibilizado sob licença de código aberto. Os modelos de IA
          utilizados possuem suas próprias licenças, disponíveis nos repositórios respectivos. Você
          mantém todos os direitos sobre as imagens que processa através do serviço.
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

      <footer class="border-t border-line pt-6">
        <a routerLink="/" class="text-sm text-accent hover:text-accent-hover">← Voltar para o início</a>
      </footer>
    </article>
  `,
})
export class TermsComponent {}
