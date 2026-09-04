import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { FileKind } from '../../core/files/kind';
import { WorkspaceService } from '../../core/services/workspace.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { MODULES, type ModuleId, type ToolDef, toolPath, toolsOfModule } from '../../core/tools/tools';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import type { IconName } from '../../shared/ui/icon/icons';
import { NetworkBadgeComponent } from '../../shared/ui/network-badge.component';
import { FaqComponent } from '../../shared/ui/faq.component';

/**
 * The modules the zero-upload engine expands to. Inert on purpose — no links, no
 * routes: a roadmap that looks shippable is a promise.
 *
 * E uma entrada SAI daqui no dia em que o módulo entra na grade acima. Já
 * saíram PDF, áudio e vídeo. Um roteiro que anuncia o que a grade da mesma tela
 * já oferece é o produto dizendo que não reparou em si mesmo — e a descrição
 * conta tanto quanto o título: "leitor de QR Code" ao lado de um gerador de QR
 * que existe lê como a mesma desatenção.
 *
 * OFFICE SAIU AGORA, e ele é o exemplo de que a regra acima não se aplica
 * sozinha: o módulo entrou na grade — comprimir, Word para texto, Excel para CSV
 * — e a entrada do roteiro continuou embaixo prometendo exatamente esses três,
 * palavra por palavra. A tela dizia "em breve" sobre o que estava dois blocos
 * acima, clicável. Quem pegou não foi ninguém lendo: foi o `01-shell`, e não pela
 * asserção que ele tem sobre o roteiro — foi pela VIOLAÇÃO DE MODO ESTRITO, dois
 * elementos com o texto "Office" na mesma página, um deles o `<h2>` do módulo.
 *
 * O QUE UMA ENTRADA PROMETE TAMBÉM PRECISA SER ENTREGÁVEL. Este mesmo item já
 * dizia "Word, Excel e PowerPoint para PDF" antes, e essa é a função que o
 * produto não consegue fazer com honestidade: cada módulo daqui existe porque o
 * navegador traz um motor de verdade — pdf.js, Web Audio, MediaRecorder,
 * WebCrypto —, e para OOXML não há motor nenhum. Um .docx é um zip de XML mais
 * uma especificação de layout que só o Word implementa por inteiro, então o
 * caminho possível (mammoth → HTML → jspdf) entrega APROXIMADAMENTE o documento.
 * A promessa foi reescrita para o que dava — comprimir e extrair —, e foi
 * exatamente isso que acabou embarcando.
 */
const SOON: ReadonlyArray<{ icon: IconName; nameKey: TranslationKey; descKey: TranslationKey }> = [
  { icon: 'palette', nameKey: 'hero.soon.design', descKey: 'hero.soon.design_desc' },
  { icon: 'zap', nameKey: 'hero.soon.productivity', descKey: 'hero.soon.productivity_desc' },
];

/**
 * The home page, which is the launcher.
 *
 * It walks `MODULES` instead of holding one hand-written block per module, and
 * that is what makes it the counterpart of the scoped rail: the rail shows the
 * module you are in, this shows all of them, and a module added to `tools.ts`
 * appears in both without either template being touched. The two blocks it
 * replaced had already drifted — one titled in hardcoded Portuguese, both painted
 * with `bg-blue-500/10` and `bg-rose-500/10`, which this design system deletes, so
 * neither badge had any colour at all.
 */
@Component({
  selector: 'app-hero',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, NetworkBadgeComponent, FaqComponent],
  templateUrl: './hero.component.html',
})
export class HeroComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly state = inject(WorkspaceService);

  /**
   * O título segue o TIPO do arquivo que está na sessão.
   *
   * Era `hero.loaded`, fixo em "Imagem pronta", de quando a sessão só sabia
   * guardar imagem. Depois do `WorkspaceService` ela guarda PDF, áudio e vídeo
   * também, e a home anunciava "Imagem pronta" para um PDF — e perguntava "o que
   * você quer fazer com ELA". O mapa é tipado pelo mesmo motivo de sempre: uma
   * chave faltando vira erro de compilação, não um título vazio.
   */
  private readonly headings: Record<FileKind, TranslationKey> = {
    image: 'hero.loaded_image',
    pdf: 'hero.loaded_pdf',
    audio: 'hero.loaded_audio',
    video: 'hero.loaded_video',
    svg: 'hero.loaded_image',
    text: 'hero.loaded_file',
    docx: 'hero.loaded_file',
    zip: 'hero.loaded_file',
    binary: 'hero.loaded_file',
    any: 'hero.loaded_file',
  };

  protected readonly loadedHeading = computed(
    () => this.i18n.t()[this.headings[this.state.kind() ?? 'any']],
  );
  protected readonly modules = MODULES;
  protected readonly soon = SOON;

  protected tools(id: ModuleId): readonly ToolDef[] {
    return toolsOfModule(id);
  }

  protected path(tool: ToolDef): string {
    const lang = this.i18n.currentLang();
    return `/${lang}/${toolPath(tool, lang)}`;
  }
}
