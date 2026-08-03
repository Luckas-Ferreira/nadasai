import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { formatBytes } from '../../core/image/image-file.util';
import { NetworkProbeService } from '../../core/services/network-probe.service';
import { TranslationService } from '../../core/services/translation.service';
import { IconComponent } from './icon/icon.component';
import { NetworkProofComponent } from './network-proof.component';

/**
 * A leitura do medidor, do tamanho de um botão, para poder ficar em TODA tela.
 *
 * O instrumento existia só na home, num cartão de 380px — ou seja, aparecia
 * exatamente onde não há arquivo nenhum em jogo, e sumia no momento em que a
 * pessoa realmente abre um documento numa ferramenta. É aí que "saiu alguma
 * coisa daqui?" vale ser respondido, e era aí que não havia resposta. Como a
 * barra do topo é sticky, esta pílula acompanha a rolagem em todas as rotas.
 *
 * O número continua sendo leitura ao vivo, nunca cópia: no instante em que
 * alguém escrever "0 bytes" fixo no template, isto vira mais uma promessa de
 * privacidade com tipografia bonita — que é justamente o que o produto existe
 * para substituir. Por isso o detalhe (destinatários, o que a página de fato
 * baixa, o convite a desligar o Wi-Fi) não foi cortado: mudou de lugar, para
 * dentro do popover, onde cabe inteiro sem ocupar a tela toda.
 */
@Component({
  selector: 'app-network-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, NetworkProofComponent],
  host: { class: 'relative block', '(document:keydown.escape)': 'open.set(false)' },
  template: `
    <button
      type="button"
      class="flex shrink-0 items-center gap-2 rounded-md border transition-colors"
      [class]="size() === 'md' ? 'h-10 px-3.5' : 'h-9 px-2.5'"
      [class.border-line]="probe.clean()"
      [class.bg-raised]="probe.clean()"
      [class.hover:border-line-strong]="probe.clean()"
      [class.border-danger-line]="!probe.clean()"
      [class.bg-danger-soft]="!probe.clean()"
      [attr.aria-label]="i18n.t()['proof.open_details']"
      [attr.aria-expanded]="open()"
      (click)="open.set(!open())"
    >
      <!-- O ping é o que diz "ao vivo". Sem ele o zero parece um rótulo. -->
      <span class="relative flex h-2 w-2 shrink-0">
        @if (probe.clean()) {
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
        }
        <span
          class="relative inline-flex h-2 w-2 rounded-full"
          [class.bg-success]="probe.clean()"
          [class.bg-danger]="!probe.clean()"
        ></span>
      </span>

      <!-- Só no tamanho grande: na home a pílula não é chrome, é a frase que dá
           nome ao produto sendo verificada na hora. Na barra do topo o espaço
           não paga esse texto — lá bastam o ponto, o número e a cor. -->
      @if (size() === 'md') {
        <span class="text-sm text-muted">{{ i18n.t()['proof.title'] }}</span>
        <span class="text-faint" aria-hidden="true">·</span>
      }

      <span
        class="font-mono tabular"
        [class]="size() === 'md' ? 'text-sm' : 'text-xs'"
        [class.text-success]="probe.clean()"
        [class.text-danger]="!probe.clean()"
      >
        {{ reading() }}
      </span>

      <!-- Some antes do que importa quando a barra aperta: o número e a cor
           sobrevivem sozinhos, a palavra é o primeiro luxo a cair. -->
      <span
        class="hidden whitespace-nowrap text-muted"
        [class]="size() === 'md' ? 'text-sm sm:block' : 'text-xs lg:block'"
      >
        {{ i18n.t()['proof.sent_short'] }}
      </span>

      <!-- Estar offline é o momento em que a promessa fica mais fácil de
           acreditar, então ele aparece na pílula em vez de esperar alguém abrir
           o popover: sem rede, e as ferramentas continuam funcionando. -->
      @if (!probe.online()) {
        <span class="shrink-0 text-success" [attr.title]="i18n.t()['proof.offline_ok']">
          <app-icon name="wifiOff" [size]="size() === 'md' ? 15 : 13" />
        </span>
      }
    </button>

    @if (open()) {
      <!-- Captura o clique fora. Fixed e não inset-0 no host: o host tem a
           largura do botão, então um backdrop preso a ele não cobriria nada. -->
      <div class="fixed inset-0 z-40" (click)="open.set(false)"></div>

      <!-- Alinhamento explícito à esquerda: na home o medidor fica dentro do
           herói, que é centralizado, e o alinhamento descia por herança para
           dentro do painel — a mesma leitura saía centrada ali e à esquerda na
           barra do topo, e o parágrafo de divulgação centrado fica pior de ler.
           O painel não deve depender de onde foi pendurado.

           (Sem crases neste comentário: ele vive DENTRO da template string do
           componente, e uma crase aqui encerra a string. Foi o que quebrou o
           build duas vezes nesta mesma tela.) -->
      <div
        class="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(22rem,calc(100vw-2rem))]
               rounded-lg border border-line bg-surface p-4 text-left shadow-pop"
        role="dialog"
        [attr.aria-label]="i18n.t()['proof.title']"
      >
        <app-network-proof />
      </div>
    }
  `,
})
export class NetworkBadgeComponent {
  protected readonly probe = inject(NetworkProbeService);
  protected readonly i18n = inject(TranslationService);

  /** `sm` na barra do topo, `md` na home, onde ela carrega o herói. */
  readonly size = input<'sm' | 'md'>('sm');

  protected readonly open = signal(false);

  protected readonly reading = computed(() =>
    this.probe.fileBytesSent() === 0
      ? this.i18n.t()['proof.zero_bytes']
      : formatBytes(this.probe.fileBytesSent()),
  );
}
