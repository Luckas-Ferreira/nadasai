import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { formatBytes } from '../../core/image/image-file.util';
import { PackService, type PackRow } from '../../core/services/pack.service';
import { TranslationService } from '../../core/services/translation.service';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { IconComponent } from '../../shared/ui/icon/icon.component';

/**
 * O que o Nada Sai guarda neste dispositivo, e o que ele pode baixar.
 *
 * Esta tela existe porque o produto baixa mais de 60 MB de motores — pesos de
 * IA, runtime ONNX, o core do Tesseract com os idiomas, o pdf.js com suas fontes
 * e tabelas — e até aqui isso chegava sem aviso e não tinha como sair. Num app
 * cujo argumento inteiro é dizer a verdade sobre o que acontece no dispositivo
 * da pessoa, ocupar 60 MB em silêncio era a contradição mais cara que sobrava.
 *
 * TUDO O QUE ELA MOSTRA É LEITURA. O tamanho de cada pacote sai do `packs.json`
 * gerado no build, e o que está em disco sai de `caches.keys()`. Nenhum número
 * aqui é texto fixo — é a mesma regra do medidor de rede, e pelo mesmo motivo:
 * um zero cravado no template transforma isto noutra promessa de privacidade com
 * tipografia bonita.
 *
 * NADA É LIDO NO CONSTRUTOR SEM GUARDA. A rota é prerenderizada, e `caches`,
 * `navigator.serviceWorker` e `localStorage` não existem no Node — a armadilha
 * que já derrubou as 72 rotas de uma vez. O `refresh()` só é chamado atrás de
 * `isPlatformBrowser`, e o servidor renderiza o ramo de "indisponível".
 *
 * FICA FORA DO SITEMAP e do `static-pages.ts`, como o `/abrir`: é uma tela de
 * ajuste, não conteúdo que alguém procure. Sem entrada no `route-map`,
 * `alternatesFor()` devolve null e o `SeoService` REMOVE as tags de hreflang em
 * vez de inventar um par, que é o comportamento pelo qual aquele arquivo existe.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, IconComponent],
  templateUrl: './settings.component.html',
})
export class SettingsComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly packs = inject(PackService);

  protected readonly autoDownload = signal(true);

  /**
   * O total em disco só é uma frase honesta depois da primeira leitura. Antes
   * dela a tela não afirma nada — mostrar "0 B" enquanto ainda se lê o cache
   * diria, por um instante, exatamente o contrário do que é verdade.
   */
  protected readonly total = computed(() => formatBytes(this.packs.totalOnDisk()));

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;

    this.autoDownload.set(this.packs.autoDownloadEnabled());
    void this.packs.refresh();
  }

  protected size(bytes: number): string {
    return formatBytes(bytes);
  }

  protected onAutoDownloadChange(event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    this.autoDownload.set(enabled);
    this.packs.setAutoDownload(enabled);
  }

  /**
   * O rótulo do botão principal muda com o estado, e "concluir" não é enfeite:
   * um pacote pela metade continua de onde parou, então prometer "baixar" de
   * novo mediria a barra desde o zero e faria a pessoa esperar o que já tem.
   */
  protected primaryLabel(row: PackRow): string {
    return row.state === 'partial'
      ? this.i18n.t()['packs.action_resume']
      : this.i18n.t()['packs.action_install'];
  }

  protected stateLabel(row: PackRow): string {
    const dict = this.i18n.t();
    switch (row.state) {
      case 'installed':
        return dict['packs.state.installed'];
      case 'partial':
        return dict['packs.state.partial'];
      case 'installing':
        return dict['packs.state.installing'];
      case 'removing':
        return dict['packs.state.removing'];
      default:
        return dict['packs.state.absent'];
    }
  }

  protected install(row: PackRow): void {
    void this.packs.install(row.pack.id);
  }

  protected remove(row: PackRow): void {
    void this.packs.remove(row.pack.id);
  }

  protected cancel(row: PackRow): void {
    this.packs.cancel(row.pack.id);
  }

  protected removeAll(): void {
    void this.packs.removeAll();
  }
}
