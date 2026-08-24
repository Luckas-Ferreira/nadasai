import type { TranslationKey } from '../services/translation.service';

/**
 * Os PACOTES DE RUNTIME: o que o produto baixa depois de aberto.
 *
 * Nada Sai não pede nada ao servidor para processar arquivo, mas precisa dos
 * MOTORES na máquina de quem usa: 42 MB de pesos IS-Net, 13 MB de runtime ONNX,
 * o core do Tesseract com os idiomas, e o pdf.js com suas fontes e tabelas de
 * caracteres. Somados passam de 60 MB, e até esta tela existir eles chegavam sem
 * aviso e não tinham como sair — num app cujo argumento inteiro é dizer a verdade
 * sobre o que acontece no dispositivo da pessoa.
 *
 * O CACHE É NOSSO, e é isso que torna "desinstalar" possível. Estes cinco
 * prefixos já foram grupos lazy do ngsw; hoje quem os serve é o handler
 * cache-first do `public/nadasai-sw.js` sobre `nadasai-packs-v1`. O motivo está
 * escrito lá: apagar entrada por entrada do cache do ngsw depende do nome e do
 * formato internos dele, o que funciona hoje e quebra em silêncio num upgrade.
 *
 * POR QUE `usedByKey` É PROSA E NÃO UMA LISTA DE `ToolId`. O pdf.js é usado por
 * dezessete ferramentas. Uma lista de dezessete ids aqui seria escrita à mão,
 * nada a verificaria, e ela ficaria errada no dia em que a décima oitava
 * aparecesse — enquanto a tela continuaria mostrando a lista antiga com cara de
 * certa. Uma frase por idioma diz a mesma coisa, cabe numa linha da tela e não
 * tem como desincronizar sem alguém ler. É a mesma escolha que fez o
 * `route-map.ts` derivar de `TOOLS` em vez de repetir: quando não dá para
 * derivar, não se finge que dá.
 *
 * PARA ACRESCENTAR UM PACOTE (o de áudio→texto é o próximo): um `PackId`, uma
 * entrada aqui com o prefixo do diretório, as três chaves nos dois dicionários,
 * o mesmo prefixo em `PACK_PREFIXES` no `public/nadasai-sw.js` e em `DIRS` no
 * `scripts/generate-packs.mjs`. Os três precisam concordar — `packs.spec.ts`
 * cobra os dois arquivos de fora, porque um prefixo que só existe aqui produz um
 * pacote que a tela mostra e o service worker nunca serve.
 */

export type PackId = 'remove-bg' | 'ocr' | 'pdf-engine';

export interface PackDef {
  readonly id: PackId;
  /**
   * Os prefixos de caminho que este pacote possui dentro do cache. Sempre com
   * barra no começo e no fim: `/model/` casa `/model/x` e não `/models/x`.
   */
  readonly prefixes: readonly string[];
  readonly nameKey: TranslationKey;
  readonly descKey: TranslationKey;
  /** Quem para de funcionar OFFLINE sem ele. Ver o cabeçalho. */
  readonly usedByKey: TranslationKey;
  /** O que o pacote contém, em prosa, para a linha de detalhe da tela. */
  readonly contentsKey: TranslationKey;
}

/** O cache que o `public/nadasai-sw.js` serve. Mudar o nome descarta tudo. */
export const PACK_CACHE = 'nadasai-packs-v1';

/**
 * A ordem é a da tela, e ela é a do PESO: o de 55 MB primeiro, porque é o que a
 * pessoa veio decidir sobre.
 */
export const PACKS: readonly PackDef[] = [
  {
    id: 'remove-bg',
    // O runtime ONNX vem junto com os pesos porque um não serve para nada sem o
    // outro: 13 MB de wasm sem os 42 MB de pesos não removem fundo nenhum, e
    // deixar os dois separados só ofereceria uma combinação inútil.
    prefixes: ['/model/', '/ort/'],
    nameKey: 'packs.remove_bg.name',
    descKey: 'packs.remove_bg.desc',
    usedByKey: 'packs.remove_bg.used_by',
    contentsKey: 'packs.remove_bg.contents',
  },
  {
    id: 'ocr',
    // OS DOIS IDIOMAS SÃO UM PACOTE SÓ, e isso não é economia de tela.
    //
    // `OcrService.recognise()` roda com `por+eng` por padrão, e é esse o padrão
    // em todos os cinco chamadores (extrair texto, o editor, PDF para texto, PDF
    // para Word). Um worker montado com `por+eng` precisa dos DOIS traineddata:
    // faltando qualquer um, o OCR não degrada para o idioma que sobrou — ele
    // falha inteiro, inclusive num documento em português. Separá-los ofereceria
    // 1,4 MB de economia em troca de um estado em que a ferramenta se diz
    // instalada e não reconhece nada. Quem quiser um idioma só ainda pode
    // escolher na tela da ferramenta; o que não existe é meia instalação.
    prefixes: ['/tesseract/', '/tessdata/'],
    nameKey: 'packs.ocr.name',
    descKey: 'packs.ocr.desc',
    usedByKey: 'packs.ocr.used_by',
    contentsKey: 'packs.ocr.contents',
  },
  {
    id: 'pdf-engine',
    prefixes: ['/pdfjs/'],
    nameKey: 'packs.pdf.name',
    descKey: 'packs.pdf.desc',
    usedByKey: 'packs.pdf.used_by',
    contentsKey: 'packs.pdf.contents',
  },
];

export function packById(id: PackId): PackDef {
  const pack = PACKS.find((candidate) => candidate.id === id);
  if (!pack) throw new Error(`Unknown pack: ${id}`);
  return pack;
}

/** O pacote dono de um caminho, ou `null` para um caminho que não é de pacote. */
export function packForPath(path: string): PackDef | null {
  return PACKS.find((pack) => pack.prefixes.some((prefix) => path.startsWith(prefix))) ?? null;
}
