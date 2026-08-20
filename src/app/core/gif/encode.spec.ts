import { encodeGif, type GifFrame } from './encode';

/**
 * O teste que importa aqui NÃO é o dos bytes do cabeçalho: é o do decodificador.
 *
 * Um GIF malformado quase nunca falha de forma visível — ele decodifica torto.
 * O LZW empacota bits do menos para o mais significativo e os corta em blocos de
 * 255 bytes; errar qualquer um dos dois produz uma imagem que abre, tem o
 * tamanho certo e mostra outra coisa. Nenhuma asserção sobre os bytes que ESTE
 * arquivo escreveu pegaria isso, porque ela conferiria o encoder contra ele
 * mesmo.
 *
 * Por isso o teste devolve o arquivo ao navegador e lê os pixels de volta. O
 * decodificador de GIF do Chrome é a referência independente que existe de graça
 * dentro do Karma — mesmo argumento pelo qual `strip.spec.ts` compara pixels
 * decodificados em vez de confiar na própria remoção de chunks.
 */

const RED = { r: 255, g: 0, b: 0 };
const BLUE = { r: 0, g: 0, b: 255 };
const GREEN = { r: 0, g: 200, b: 0 };

/** Decodifica o GIF pelo navegador e devolve os pixels do PRIMEIRO quadro. */
async function decodeFirstFrame(
  bytes: Uint8Array,
  width: number,
  height: number,
): Promise<Uint8ClampedArray> {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'image/gif' });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('o navegador recusou o GIF'));
      image.src = url;
    });

    expect(image.naturalWidth).toBe(width);
    expect(image.naturalHeight).toBe(height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);

    return ctx.getImageData(0, 0, width, height).data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

describe('encodeGif', () => {
  it('writes a file the browser decodes back to the same pixels', async () => {
    // Xadrez 4x4 em duas cores: qualquer erro de empacotamento de bits embaralha
    // o padrão de um jeito que a comparação pixel a pixel enxerga.
    const width = 4;
    const height = 4;
    const indices = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) indices[y * width + x] = (x + y) % 2;
    }

    const bytes = encodeGif([{ indices, delayCs: 10 }], {
      width,
      height,
      palette: [RED, BLUE],
    });

    const pixels = await decodeFirstFrame(bytes, width, height);

    for (let i = 0; i < width * height; i++) {
      const expected = indices[i] === 0 ? RED : BLUE;
      expect(pixels[i * 4]).withContext(`pixel ${i} R`).toBe(expected.r);
      expect(pixels[i * 4 + 1]).withContext(`pixel ${i} G`).toBe(expected.g);
      expect(pixels[i * 4 + 2]).withContext(`pixel ${i} B`).toBe(expected.b);
      expect(pixels[i * 4 + 3]).withContext(`pixel ${i} alfa`).toBe(255);
    }
  });

  /**
   * Um quadro de 300 pixels iguais passa das 255 posições de um subbloco depois
   * de comprimido? Não — mas um quadro grande o bastante passa, e é aí que o
   * corte em blocos entra. 200x200 garante que o fluxo tenha vários blocos.
   */
  it('survives a frame large enough to need several sub-blocks', async () => {
    const width = 200;
    const height = 200;
    const indices = new Uint8Array(width * height);

    // Faixas verticais irregulares: conteúdo que o LZW não colapsa num punhado
    // de códigos, ao contrário de uma imagem chapada.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) indices[y * width + x] = (x * 7 + y * 3) % 3;
    }

    const bytes = encodeGif([{ indices, delayCs: 5 }], {
      width,
      height,
      palette: [RED, BLUE, GREEN],
    });

    const pixels = await decodeFirstFrame(bytes, width, height);
    const palette = [RED, BLUE, GREEN];

    for (const i of [0, 1, width - 1, width * 37 + 91, width * height - 1]) {
      const expected = palette[indices[i]];
      expect(pixels[i * 4]).withContext(`pixel ${i} R`).toBe(expected.r);
      expect(pixels[i * 4 + 1]).withContext(`pixel ${i} G`).toBe(expected.g);
      expect(pixels[i * 4 + 2]).withContext(`pixel ${i} B`).toBe(expected.b);
    }
  });

  it('animates: several frames, and a loop block before the first one', () => {
    const indices = new Uint8Array(4);
    const frames: GifFrame[] = [
      { indices, delayCs: 8 },
      { indices: new Uint8Array([1, 1, 1, 1]), delayCs: 8 },
      { indices, delayCs: 8 },
    ];

    const bytes = encodeGif(frames, { width: 2, height: 2, palette: [RED, BLUE] });
    const text = Array.from(bytes, (b) => String.fromCharCode(b)).join('');

    expect(text.startsWith('GIF89a')).withContext('assinatura').toBe(true);
    expect(bytes[bytes.length - 1]).withContext('terminador').toBe(0x3b);

    // A extensão de repetição precisa vir ANTES do primeiro descritor de imagem
    // (0x2C) — depois dele os leitores a ignoram e o GIF toca uma vez só.
    const netscape = text.indexOf('NETSCAPE2.0');
    expect(netscape).withContext('sem bloco de repetição').toBeGreaterThan(0);
    expect(netscape).toBeLessThan(bytes.indexOf(0x2c));

    // Três descritores de imagem, um por quadro.
    let images = 0;
    for (let i = 0; i < bytes.length - 1; i++) if (bytes[i] === 0x2c) images++;
    expect(images).withContext('quadros escritos').toBeGreaterThanOrEqual(3);
  });

  it('refuses a frame whose size does not match the screen', () => {
    expect(() =>
      encodeGif([{ indices: new Uint8Array(3), delayCs: 10 }], {
        width: 2,
        height: 2,
        palette: [RED],
      }),
    ).toThrow();
  });

  /** O formato guarda centésimos de segundo, e zero significa "o mais rápido
   *  que der" em alguns leitores e "pare" em outros. Nunca zero. */
  it('never writes a zero delay', () => {
    const bytes = encodeGif([{ indices: new Uint8Array(4), delayCs: 0.2 }], {
      width: 2,
      height: 2,
      palette: [RED, BLUE],
    });

    const gce = bytes.indexOf(0xf9);
    expect(gce).toBeGreaterThan(0);
    // 0x21 0xF9 0x04 <packed> <delay lo> <delay hi>
    const delay = bytes[gce + 3] | (bytes[gce + 4] << 8);
    expect(delay).toBeGreaterThanOrEqual(1);
  });
});
