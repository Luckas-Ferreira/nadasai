/**
 * Escritor de GIF89a animado — cabeçalho, paleta global, quadros e LZW.
 *
 * POR QUE ESCRITO À MÃO. É a mesma decisão do encoder de QR em `core/qr/` e do
 * encoder de PNG das fixtures: o formato é de 1987, cabe em duzentas linhas, e
 * a alternativa seria uma dependência nova num app que precisa servir todo asset
 * de runtime da própria origem (`require-corp` recusa subrecurso de terceiro).
 * O que existe de biblioteca aqui ou arrasta um wasm de megabytes, ou busca o
 * próprio worker de um CDN — as duas coisas que este produto não pode fazer.
 *
 * O QUE FAZ O ARQUIVO FICAR GRANDE, já que é a pergunta que toda ferramenta de
 * GIF precisa responder: o formato não tem compressão temporal de verdade. Cada
 * quadro é uma imagem inteira comprimida com LZW, um algoritmo de dicionário
 * que só enxerga a linha que está passando. Dois quadros idênticos ocupam o
 * dobro de um. É por isso que a ferramenta que usa este módulo controla
 * quadros, largura e cores em vez de oferecer um controle de "qualidade": no
 * GIF, tamanho é contagem de pixels vezes contagem de quadros.
 *
 * LZW EM SUBBLOCOS, e é onde as implementações caseiras erram: o fluxo de bits
 * é empacotado do bit menos significativo para o mais significativo, e depois
 * cortado em blocos de no máximo 255 bytes, cada um precedido do próprio
 * tamanho. Um bloco de 256 bytes não é "quase certo" — o decodificador lê o
 * tamanho como um byte e a imagem inteira desanda a partir dali.
 */

export interface GifFrame {
  /** Um índice de paleta por pixel, comprimento width*height. */
  readonly indices: Uint8Array;
  /** Centésimos de segundo. É a unidade do formato, não milissegundos. */
  readonly delayCs: number;
}

export interface GifOptions {
  readonly width: number;
  readonly height: number;
  /** Até 256 cores, na ordem em que os índices dos quadros as referenciam. */
  readonly palette: ReadonlyArray<{ r: number; g: number; b: number }>;
  /** 0 = repete para sempre, que é o que todo mundo espera de um GIF. */
  readonly loop?: number;
}

/** Bytes acumulados, com escrita LSB-first para o fluxo do LZW. */
class ByteSink {
  private buf = new Uint8Array(1024);
  private len = 0;

  push(byte: number): void {
    if (this.len === this.buf.length) {
      const bigger = new Uint8Array(this.buf.length * 2);
      bigger.set(this.buf);
      this.buf = bigger;
    }
    this.buf[this.len++] = byte & 0xff;
  }

  pushAll(bytes: ArrayLike<number>): void {
    for (let i = 0; i < bytes.length; i++) this.push(bytes[i]);
  }

  /** u16 little-endian, que é a ordem de TODO inteiro do formato. */
  pushU16(value: number): void {
    this.push(value & 0xff);
    this.push((value >> 8) & 0xff);
  }

  pushAscii(text: string): void {
    for (let i = 0; i < text.length; i++) this.push(text.charCodeAt(i));
  }

  toBytes(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

/**
 * LZW do GIF: dicionário de 4096 entradas, largura de código variável a partir
 * de `minCodeSize + 1`, e um código de limpeza emitido quando o dicionário
 * enche.
 *
 * O código de limpeza no INÍCIO não é opcional por convenção: o decodificador
 * espera reiniciar o dicionário antes do primeiro símbolo, e sem ele os
 * primeiros pixels saem trocados em vez de a imagem falhar de forma visível.
 */
function lzwCompress(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;

  const out = new ByteSink();
  let bitBuffer = 0;
  let bitCount = 0;

  const emit = (code: number): void => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  // Dicionário como mapa de (prefixo, byte) -> código. Um Map por prefixo custa
  // alocação demais num laço por pixel; a chave empacotada é uma multiplicação.
  let dict = new Map<number, number>();

  emit(clearCode);

  let prefix = indices.length > 0 ? indices[0] : 0;

  for (let i = 1; i < indices.length; i++) {
    const next = indices[i];
    const key = prefix * 256 + next;
    const existing = dict.get(key);

    if (existing !== undefined) {
      prefix = existing;
      continue;
    }

    emit(prefix);
    dict.set(key, nextCode++);

    if (nextCode > 0xfff) {
      emit(clearCode);
      dict = new Map<number, number>();
      codeSize = minCodeSize + 1;
      nextCode = endCode + 1;
    } else if (nextCode > 1 << codeSize) {
      codeSize++;
    }

    prefix = next;
  }

  if (indices.length > 0) emit(prefix);
  emit(endCode);

  if (bitCount > 0) out.push(bitBuffer & 0xff);

  return out.toBytes();
}

/** Corta o fluxo em subblocos de no máximo 255 bytes, cada um com o tamanho. */
function writeSubBlocks(sink: ByteSink, data: Uint8Array): void {
  for (let offset = 0; offset < data.length; offset += 255) {
    const chunk = data.subarray(offset, Math.min(offset + 255, data.length));
    sink.push(chunk.length);
    sink.pushAll(chunk);
  }
  sink.push(0x00);
}

/** Tamanho da tabela de cores: potência de dois, de 2 a 256. */
function tableSizeFor(colors: number): { entries: number; bits: number } {
  let bits = 1;
  while (1 << bits < Math.max(colors, 2)) bits++;
  if (bits > 8) bits = 8;
  return { entries: 1 << bits, bits };
}

export function encodeGif(frames: readonly GifFrame[], opts: GifOptions): Uint8Array {
  const { width, height, palette } = opts;

  if (width <= 0 || height <= 0) throw new Error('gif: dimensão inválida');
  if (palette.length === 0) throw new Error('gif: paleta vazia');
  if (palette.length > 256) throw new Error('gif: paleta acima de 256 cores');

  const { entries, bits } = tableSizeFor(palette.length);
  const sink = new ByteSink();

  sink.pushAscii('GIF89a');
  sink.pushU16(width);
  sink.pushU16(height);
  // Bit 7: existe tabela global. Bits 6-4: resolução de cor (convenção: 7).
  // Bits 2-0: tamanho da tabela, como expoente menos um.
  sink.push(0x80 | 0x70 | (bits - 1));
  sink.push(0); // índice de fundo
  sink.push(0); // proporção de pixel: 0 = quadrado

  for (let i = 0; i < entries; i++) {
    const color = palette[i] ?? { r: 0, g: 0, b: 0 };
    sink.push(color.r);
    sink.push(color.g);
    sink.push(color.b);
  }

  // Extensão da Netscape: a única forma de dizer "repita", e ela precisa vir
  // ANTES do primeiro quadro. Depois dele, os leitores a ignoram e o GIF toca
  // uma vez só — que é o defeito mais reportado de encoder caseiro.
  if (frames.length > 1) {
    sink.push(0x21);
    sink.push(0xff);
    sink.push(0x0b);
    sink.pushAscii('NETSCAPE2.0');
    sink.push(0x03);
    sink.push(0x01);
    sink.pushU16(opts.loop ?? 0);
    sink.push(0x00);
  }

  const minCodeSize = Math.max(2, bits);

  for (const frame of frames) {
    if (frame.indices.length !== width * height) {
      throw new Error('gif: quadro com tamanho diferente da tela');
    }

    // Controle gráfico: descarte 1 (não restaura o fundo — os quadros aqui são
    // sempre opacos e cobrem a tela inteira) e sem cor transparente.
    sink.push(0x21);
    sink.push(0xf9);
    sink.push(0x04);
    sink.push(0x04);
    sink.pushU16(Math.max(1, Math.round(frame.delayCs)));
    sink.push(0x00);
    sink.push(0x00);

    sink.push(0x2c);
    sink.pushU16(0);
    sink.pushU16(0);
    sink.pushU16(width);
    sink.pushU16(height);
    sink.push(0x00); // sem tabela local, sem entrelaçamento

    sink.push(minCodeSize);
    writeSubBlocks(sink, lzwCompress(frame.indices, minCodeSize));
  }

  sink.push(0x3b);

  return sink.toBytes();
}
