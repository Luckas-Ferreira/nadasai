/**
 * Metadados de arquivo do Office — ler e limpar.
 *
 * Um `.docx`, `.xlsx` ou `.pptx` é um ZIP com XML dentro, e os metadados moram
 * em dois arquivos previsíveis:
 *
 *   • `docProps/core.xml` — autor, último a salvar, título, assunto, palavras
 *     -chave, categoria, e as datas de criação e modificação. É o Dublin Core.
 *   • `docProps/app.xml` — empresa, gerente, aplicativo que gerou, tempo total
 *     de edição, número de revisão, modelo usado.
 *
 * O que torna isto uma ferramenta de privacidade e não uma curiosidade: o campo
 * `cp:lastModifiedBy` guarda o nome de usuário de QUEM SALVOU POR ÚLTIMO, e
 * `Company` guarda o nome da organização configurada no Office. Um currículo
 * enviado a dez empresas costuma carregar o nome do computador de casa; uma
 * proposta comercial costuma carregar o nome do cliente anterior, porque foi
 * feita a partir do arquivo dele. `TotalTime` diz quantos minutos o documento
 * ficou aberto, o que já foi usado para contestar prazo em processo.
 *
 * ── COMO A LIMPEZA É FEITA, E POR QUE ASSIM ─────────────────────────────────
 *
 * Reescrevendo os dois XML e reempacotando o ZIP com TODAS as outras entradas
 * copiadas byte a byte. Não se decodifica documento nenhum: o texto, as
 * imagens, as fórmulas e a formatação atravessam intactos, e o arquivo continua
 * abrindo no Office como antes.
 *
 * É a mesma escolha do `core/exif/strip.ts` — remover o que se conhece e copiar
 * o resto — e pelo mesmo motivo: qualquer coisa que decodifique e regrave o
 * conteúdo é um segundo lugar onde o documento pode se degradar.
 */
import { unzipSync, zipSync } from 'fflate';

export type OfficeKind = 'docx' | 'xlsx' | 'pptx';

export interface OfficeMetadata {
  /** Campo → valor, só os que existem e não estão vazios. */
  readonly core: ReadonlyMap<string, string>;
  readonly app: ReadonlyMap<string, string>;
  readonly kind: OfficeKind;
  /** Quantos campos foram encontrados no total. */
  readonly count: number;
}

const CORE_PATH = 'docProps/core.xml';
const APP_PATH = 'docProps/app.xml';

/**
 * Campos de `core.xml` que carregam identidade ou hábito, na ordem em que
 * importam. Os outros do Dublin Core (`dc:description`, `dc:language`) também
 * são lidos, mas estes são os que a interface destaca.
 */
export const SENSITIVE_CORE = [
  'dc:creator',
  'cp:lastModifiedBy',
  'dc:title',
  'dc:subject',
  'cp:keywords',
  'cp:category',
  'dcterms:created',
  'dcterms:modified',
  'cp:lastPrinted',
  'cp:revision',
] as const;

/** Campos de `app.xml` equivalentes. */
export const SENSITIVE_APP = [
  'Company',
  'Manager',
  'Application',
  'AppVersion',
  'Template',
  'TotalTime',
  'LastAuthor',
] as const;

export function officeKindOf(name: string): OfficeKind | null {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'docx' || ext === 'xlsx' || ext === 'pptx') return ext;
  return null;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/** Lê os metadados sem alterar nada. */
export function readOfficeMetadata(bytes: Uint8Array, kind: OfficeKind): OfficeMetadata {
  const entries = unzipSync(bytes);

  const core = parseFields(entries[CORE_PATH]);
  const app = parseFields(entries[APP_PATH]);

  return { core, app, kind, count: core.size + app.size };
}

export interface CleanResult {
  readonly bytes: Uint8Array;
  /** Quantos campos foram apagados. */
  readonly removed: number;
}

/**
 * Devolve o arquivo com os metadados removidos.
 *
 * `keep` é a lista de campos a PRESERVAR — quase sempre vazia, mas o título de
 * um documento publicado é legítimo e às vezes se quer manter. Tudo que não
 * estiver nela é esvaziado.
 *
 * Os elementos são esvaziados e não REMOVIDOS: o Office recria os que faltam na
 * próxima gravação, e alguns leitores estritos reclamam de `core.xml` sem os
 * elementos obrigatórios do Dublin Core. Um elemento vazio não carrega
 * informação nenhuma e não quebra ninguém.
 */
export function cleanOfficeMetadata(
  bytes: Uint8Array,
  keep: readonly string[] = [],
): CleanResult {
  const entries = unzipSync(bytes);
  const keepSet = new Set(keep);
  let removed = 0;

  for (const path of [CORE_PATH, APP_PATH]) {
    const raw = entries[path];
    if (!raw) continue;

    const { xml, cleared } = clearFields(decoder.decode(raw), keepSet);
    entries[path] = encoder.encode(xml);
    removed += cleared;
  }

  // `zipSync` reescreve o container, mas o CONTEÚDO de cada entrada que não foi
  // tocada é o mesmo array de bytes que saiu do `unzipSync`. Nada é decodificado
  // e recodificado — nem o texto, nem as imagens, nem as fórmulas.
  return { bytes: zipSync(entries), removed };
}

/** Extrai `<tag>valor</tag>` de um XML plano. */
function parseFields(raw: Uint8Array | undefined): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  if (!raw) return out;

  const xml = decoder.decode(raw);

  for (const match of xml.matchAll(/<([A-Za-z][\w:.-]*)(?:\s[^>]*)?>([^<]*)<\/\1>/g)) {
    const [, tag, value] = match;
    const text = decodeEntities(value).trim();
    if (text) out.set(tag, text);
  }

  return out;
}

/**
 * Esvazia o conteúdo de cada elemento, preservando os que estão em `keep`.
 *
 * A troca é feita por regex sobre o XML e não por um parser de DOM, e vale
 * dizer por quê: `DOMParser` não existe no worker do prerender, e um parser
 * completo aqui seria uma dependência nova para reescrever dois arquivos cuja
 * estrutura é plana — sem aninhamento, sem namespace dinâmico, sem CDATA. O
 * padrão exige que a tag de fechamento case com a de abertura (`\1`), então
 * conteúdo aninhado não é tocado por acidente.
 */
function clearFields(xml: string, keep: ReadonlySet<string>): { xml: string; cleared: number } {
  let cleared = 0;

  const out = xml.replace(
    /<([A-Za-z][\w:.-]*)((?:\s[^>]*)?)>([^<]*)<\/\1>/g,
    (whole, tag: string, attrs: string, value: string) => {
      if (keep.has(tag) || value.trim() === '') return whole;
      cleared++;
      return `<${tag}${attrs}></${tag}>`;
    },
  );

  return { xml: out, cleared };
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');
}
