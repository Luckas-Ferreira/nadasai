/**
 * AS IMAGENS DENTRO DE UM ARQUIVO DO OFFICE.
 *
 * Um `.docx`, `.xlsx` ou `.pptx` é um zip, e num arquivo real o peso quase todo
 * está em `word/media/`, `ppt/media/` ou `xl/media/` — a foto que alguém colou
 * numa apresentação saiu de uma câmera de 12 MP e é exibida num quadrado de
 * cinco centímetros. Comprimir um Office é, na prática, recomprimir essas
 * imagens e devolver o resto do zip intocado.
 *
 * Este arquivo é a parte que dá para provar sem navegador: QUAIS entradas são
 * candidatas. A recodificação em si precisa de canvas e mora no serviço.
 *
 * O critério aqui é conservador de propósito. Uma entrada que este módulo não
 * reconhece é copiada byte a byte, exatamente como o `metadata.ts` faz — a
 * diferença entre um arquivo menor e um arquivo quebrado é justamente não
 * mexer no que não se entende.
 */

/** As pastas onde cada tipo guarda mídia. `xl` também usa `xl/media/`. */
const MEDIA_PREFIXES = ['word/media/', 'ppt/media/', 'xl/media/', 'word/embeddings/'] as const;

/**
 * O que o canvas sabe decodificar E devolver menor.
 *
 * EMF e WMF ficam de fora e são o caso mais comum de exclusão num `.docx`:
 * são formatos VETORIAIS da Microsoft, nenhum navegador os decodifica, e um
 * `<img>` apontado para eles falha em silêncio. SVG também sai — recodificar
 * vetor como raster é destruir o que ele tem de melhor.
 *
 * GIF sai por outro motivo: pode ser animado, e um `drawImage` num canvas
 * captura só o primeiro quadro. É a mesma armadilha que o `loadImage` do módulo
 * de imagem documenta.
 */
const RECOMPRESSIBLE = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp']);

export interface OfficeMediaEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly ext: string;
  /** PNG e WebP podem ter canal alfa; JPEG nunca tem. */
  readonly mayHaveAlpha: boolean;
}

export function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot + 1).toLowerCase();
}

export function isMediaPath(path: string): boolean {
  return MEDIA_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * As entradas de mídia que vale a pena tentar recomprimir.
 *
 * Devolve na ordem do MAIOR para o menor: quem processa pode assim mostrar
 * progresso que anda depressa no começo, e — mais importante — quem lê o
 * resultado vê primeiro o que de fato pesava.
 */
export function findMedia(entries: Record<string, Uint8Array>): OfficeMediaEntry[] {
  const found: OfficeMediaEntry[] = [];

  for (const [path, bytes] of Object.entries(entries)) {
    if (!isMediaPath(path)) continue;

    const ext = extensionOf(path);
    if (!RECOMPRESSIBLE.has(ext)) continue;

    // Diretórios aparecem como entradas de tamanho zero em alguns produtores.
    if (bytes.byteLength === 0) continue;

    found.push({
      path,
      bytes,
      ext,
      mayHaveAlpha: ext === 'png' || ext === 'webp',
    });
  }

  return found.sort((a, b) => b.bytes.byteLength - a.bytes.byteLength);
}

export function totalBytes(entries: readonly OfficeMediaEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
}

/** Quanto do arquivo inteiro é mídia — é o teto do que a compressão pode ganhar. */
export function mediaShare(entries: Record<string, Uint8Array>): number {
  let media = 0;
  let all = 0;

  for (const [path, bytes] of Object.entries(entries)) {
    all += bytes.byteLength;
    if (isMediaPath(path) && RECOMPRESSIBLE.has(extensionOf(path))) media += bytes.byteLength;
  }

  return all === 0 ? 0 : media / all;
}

export interface CompressLevel {
  /** Maior lado, em pixels. Acima disso a imagem é reduzida. */
  readonly maxSide: number;
  /** Qualidade JPEG, de 0 a 1. */
  readonly quality: number;
}

/**
 * Os três degraus, e a redução de TAMANHO é o que carrega cada um.
 *
 * Baixar só a qualidade de uma foto de 4000 px exibida num slide de 1024
 * entrega uma foto de 4000 px borrada: os pixels que ninguém vê continuam
 * ocupando o arquivo. É a mesma lição do compressor de vídeo, e por isso o
 * lado máximo vem primeiro na conta.
 *
 * 1600 px é o padrão porque um slide em tela cheia tem 1920 de largura e uma
 * imagem raramente ocupa a tela inteira.
 */
export const COMPRESS_LEVELS: Record<'high' | 'balanced' | 'low', CompressLevel> = {
  high: { maxSide: 2400, quality: 0.86 },
  balanced: { maxSide: 1600, quality: 0.78 },
  low: { maxSide: 1200, quality: 0.68 },
};

/** As dimensões depois do teto, mantendo a proporção. Nunca amplia. */
export function fitWithin(width: number, height: number, maxSide: number): { w: number; h: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide || longest === 0) return { w: width, h: height };

  const scale = maxSide / longest;
  return {
    w: Math.max(1, Math.round(width * scale)),
    h: Math.max(1, Math.round(height * scale)),
  };
}
