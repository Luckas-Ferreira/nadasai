import {
  COMPRESS_LEVELS,
  extensionOf,
  findMedia,
  fitWithin,
  isMediaPath,
  mediaShare,
  totalBytes,
} from './media';

/** Um zip fictício: caminho → bytes, que é o que o fflate devolve. */
function entries(spec: Record<string, number>): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const [path, size] of Object.entries(spec)) out[path] = new Uint8Array(size);
  return out;
}

describe('office media', () => {
  describe('isMediaPath', () => {
    it('recognises where each Office kind keeps its pictures', () => {
      expect(isMediaPath('word/media/image1.png')).toBe(true);
      expect(isMediaPath('ppt/media/image3.jpeg')).toBe(true);
      expect(isMediaPath('xl/media/image1.png')).toBe(true);
    });

    it('leaves the document body alone', () => {
      expect(isMediaPath('word/document.xml')).toBe(false);
      expect(isMediaPath('docProps/core.xml')).toBe(false);
      expect(isMediaPath('[Content_Types].xml')).toBe(false);
    });
  });

  describe('findMedia', () => {
    it('picks only what a canvas can decode', () => {
      const found = findMedia(
        entries({
          'word/media/image1.png': 500,
          'word/media/image2.jpg': 400,
          'word/media/image3.emf': 900,
          'word/media/image4.wmf': 800,
          'word/media/image5.svg': 700,
          'word/document.xml': 300,
        }),
      );

      expect(found.map((f) => f.path)).toEqual(['word/media/image1.png', 'word/media/image2.jpg']);
    });

    /**
     * EMF e WMF são o caso comum, não a exceção: o Word converte gráfico colado
     * para esses formatos, nenhum navegador os decodifica, e mexer neles seria
     * trocar um arquivo grande por um arquivo quebrado.
     */
    it('never touches the vector formats Word inserts', () => {
      const found = findMedia(entries({ 'word/media/chart.emf': 90_000 }));

      expect(found).toEqual([]);
    });

    /** GIF pode ser animado, e um canvas captura só o primeiro quadro. */
    it('skips GIF, which a canvas would flatten to one frame', () => {
      expect(findMedia(entries({ 'ppt/media/loop.gif': 5000 }))).toEqual([]);
    });

    it('orders by weight, heaviest first', () => {
      const found = findMedia(
        entries({
          'ppt/media/small.jpg': 100,
          'ppt/media/huge.jpg': 9000,
          'ppt/media/mid.png': 2000,
        }),
      );

      expect(found.map((f) => f.path)).toEqual([
        'ppt/media/huge.jpg',
        'ppt/media/mid.png',
        'ppt/media/small.jpg',
      ]);
    });

    it('flags the formats that can carry transparency', () => {
      const found = findMedia(entries({ 'word/media/a.png': 10, 'word/media/b.jpg': 20 }));
      const byPath = new Map(found.map((f) => [f.path, f.mayHaveAlpha]));

      expect(byPath.get('word/media/a.png')).toBe(true);
      expect(byPath.get('word/media/b.jpg')).toBe(false);
    });

    it('ignores the zero-length entries some producers write for folders', () => {
      expect(findMedia(entries({ 'word/media/': 0 }))).toEqual([]);
    });
  });

  describe('mediaShare', () => {
    /** É o TETO do que a compressão pode ganhar, e o painel o mostra antes. */
    it('measures how much of the file is recompressible picture', () => {
      const share = mediaShare(
        entries({ 'word/media/image1.jpg': 750, 'word/document.xml': 250 }),
      );

      expect(share).toBeCloseTo(0.75, 5);
    });

    it('counts an all-text document as nothing to gain', () => {
      expect(mediaShare(entries({ 'word/document.xml': 1000 }))).toBe(0);
    });

    it('does not count what it cannot recompress', () => {
      expect(mediaShare(entries({ 'word/media/a.emf': 900, 'word/document.xml': 100 }))).toBe(0);
    });
  });

  describe('fitWithin', () => {
    it('shrinks the long side and keeps the ratio', () => {
      expect(fitWithin(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200 });
      expect(fitWithin(3000, 4000, 1600)).toEqual({ w: 1200, h: 1600 });
    });

    /** Ampliar não comprime nada — mesma regra do `outputSize` no vídeo. */
    it('never enlarges', () => {
      expect(fitWithin(800, 600, 1600)).toEqual({ w: 800, h: 600 });
    });

    it('never returns a zero side', () => {
      expect(fitWithin(1000, 1, 100).h).toBeGreaterThanOrEqual(1);
    });
  });

  describe('levels', () => {
    it('gets smaller and lighter as it goes down', () => {
      expect(COMPRESS_LEVELS.high.maxSide).toBeGreaterThan(COMPRESS_LEVELS.balanced.maxSide);
      expect(COMPRESS_LEVELS.balanced.maxSide).toBeGreaterThan(COMPRESS_LEVELS.low.maxSide);
      expect(COMPRESS_LEVELS.high.quality).toBeGreaterThan(COMPRESS_LEVELS.low.quality);
    });
  });

  describe('helpers', () => {
    it('reads the extension in lower case', () => {
      expect(extensionOf('word/media/IMAGE1.PNG')).toBe('png');
      expect(extensionOf('no-dot')).toBe('');
    });

    it('sums the weight of what it found', () => {
      const found = findMedia(entries({ 'word/media/a.jpg': 300, 'word/media/b.png': 200 }));
      expect(totalBytes(found)).toBe(500);
    });
  });
});
