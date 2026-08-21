/**
 * What a file IS, for the purpose of deciding which tool can take it next.
 *
 * This is deliberately coarser than a MIME type and deliberately finer than the
 * four modules. Coarser, because `image/png` and `image/webp` are the same thing
 * to every tool that accepts an image. Finer, because the module a tool is filed
 * under says where it appears in the rail, not what it eats: `pdf-to-img` lives
 * in the PDF module and hands back an image, `img-to-pdf` lives in the image
 * module and hands back a PDF, and `redact-pdf` lives in privacy and eats a PDF.
 * A chain built on `category` would get all three wrong.
 *
 * `'any'` only ever appears in a tool's `accepts` — encrypt-file and file-hash
 * genuinely take whatever you have. Nothing *produces* `'any'`.
 */
export type FileKind =
  | 'image'
  | 'pdf'
  | 'audio'
  | 'video'
  | 'text'
  | 'svg'
  | 'docx'
  | 'zip'
  /**
   * Bytes que nenhum tipo reconhece — e isso NÃO é uma falha de classificação.
   * Um `.enc` produzido aqui mesmo, um dump, um arquivo de um programa qualquer:
   * é literalmente o que criptografar-arquivo e hash-de-arquivo existem para
   * receber. Só `accepts: ['any']` cobre este tipo, então ele entra na sessão
   * sem chegar perto de nenhuma ferramenta que fosse tentar decodificá-lo.
   */
  | 'binary'
  | 'any';

/** What the extension says, when the MIME type is empty or a lie. */
const BY_EXTENSION: ReadonlyArray<readonly [RegExp, FileKind]> = [
  [/\.svgz?$/i, 'svg'],
  [/\.(png|jpe?g|webp|gif|bmp|avif|ico|tiff?)$/i, 'image'],
  [/\.pdf$/i, 'pdf'],
  [/\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)$/i, 'audio'],
  [/\.(mp4|m4v|mov|webm|mkv|avi|ogv|3gp|mpe?g)$/i, 'video'],
  [/\.(txt|md|csv|json|xml|log|srt|vtt)$/i, 'text'],
  // O tipo cobre o OOXML do Office inteiro, e não só o Word: planilha e
  // apresentação têm a mesma forma (um zip com XML) e passam pelas mesmas
  // ferramentas. Sem isto elas cairiam em 'binary', que é o balde do
  // desconhecido — e aí a limpeza de metadados só seria oferecida junto com
  // criptografar e hash, que aceitam qualquer coisa.
  [/\.(docx|doc|xlsx|xls|pptx|ppt)$/i, 'docx'],
  [/\.zip$/i, 'zip'],
];

/**
 * The kind of a file. Nunca `null`: o desconhecido é `'binary'`, um tipo de
 * verdade, e quem decide se aquilo serve é o `accepts` da ferramenta.
 *
 * SVG is tested BEFORE the generic `image/` prefix on purpose: its MIME type is
 * `image/svg+xml`, so a prefix test files a vector as a raster — and the chain
 * would then offer a vectorised logo to crop, which decodes it into a canvas and
 * throws away the very thing the tool just produced.
 *
 * `.mkv` and `.avi` arrive from Windows with an empty `type` often enough that a
 * MIME-only test is not enough; `video-file.util.ts` already documents the same
 * trap for the same reason. Extension is the fallback, never the first answer.
 */
export function kindOf(file: { readonly type: string; readonly name: string }): FileKind {
  const mime = file.type.toLowerCase();

  if (mime === 'image/svg+xml') return 'svg';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'application/zip' || mime === 'application/x-zip-compressed') return 'zip';
  if (mime.startsWith('application/vnd.openxmlformats-officedocument.wordprocessing')) return 'docx';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('text/')) return 'text';

  for (const [pattern, kind] of BY_EXTENSION) {
    if (pattern.test(file.name)) return kind;
  }

  return 'binary';
}
