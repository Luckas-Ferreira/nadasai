import {
  bytesForPack,
  filesForPack,
  installedBytes,
  ownedPaths,
  stateOf,
  tesseractCoreFile,
  type PackInventory,
  type RuntimeFacts,
} from './pack-files';
import { packById } from './packs';

const NONE: RuntimeFacts = { simd: false, relaxedSimd: false };
const SIMD: RuntimeFacts = { simd: true, relaxedSimd: false };
const RELAXED: RuntimeFacts = { simd: true, relaxedSimd: true };

/** Um inventário do formato que o scripts/generate-packs.mjs escreve. */
const INVENTORY: PackInventory = {
  files: {
    '/model/isnet-q8.manifest.json': 100,
    '/model/isnet-q8.onnx.part0': 23_068_672,
    '/model/isnet-q8.onnx.part1': 21_400_000,
    '/ort/ort-wasm-simd-threaded.wasm': 13_000_000,
    '/ort/ort-wasm-simd-threaded.mjs': 200_000,
    '/tesseract/worker.min.js': 900_000,
    '/tesseract/tesseract-core-lstm.wasm.js': 3_700_000,
    '/tesseract/tesseract-core-simd-lstm.wasm.js': 3_800_000,
    '/tesseract/tesseract-core-relaxedsimd-lstm.wasm.js': 3_900_000,
    '/tessdata/por.traineddata.gz': 1_400_000,
    '/tessdata/eng.traineddata.gz': 2_700_000,
    '/pdfjs/pdf.worker.min.mjs': 1_200_000,
    '/pdfjs/cmaps/Adobe-Japan1-0.bcmap': 6_000,
  },
};

describe('tesseractCoreFile', () => {
  it('mirrors getCore.js: relaxed wins over simd, simd over base', () => {
    expect(tesseractCoreFile(RELAXED)).toBe('/tesseract/tesseract-core-relaxedsimd-lstm.wasm.js');
    expect(tesseractCoreFile(SIMD)).toBe('/tesseract/tesseract-core-simd-lstm.wasm.js');
    expect(tesseractCoreFile(NONE)).toBe('/tesseract/tesseract-core-lstm.wasm.js');
  });

  it('always picks an LSTM build', () => {
    // O OcrService constrói o worker com OEM 1 (LSTM_ONLY). Uma variante Legacy
    // aqui daria 404 no core, offline, depois de o pacote se dizer instalado.
    for (const facts of [NONE, SIMD, RELAXED]) {
      expect(tesseractCoreFile(facts)).toContain('-lstm.wasm.js');
    }
  });
});

describe('filesForPack', () => {
  const ocr = packById('ocr');

  it('installs ONE tesseract core, never the three', () => {
    // As três somam 11,4 MB para usar 3,8. Este é o teste que impede a regressão
    // mais cara do pacote de OCR.
    const files = filesForPack(ocr, INVENTORY, SIMD);
    const cores = files.filter((path) => path.includes('tesseract-core'));

    expect(cores).toEqual(['/tesseract/tesseract-core-simd-lstm.wasm.js']);
  });

  it('keeps the worker and every language alongside the core', () => {
    const files = filesForPack(ocr, INVENTORY, RELAXED);

    expect(files).toContain('/tesseract/worker.min.js');
    expect(files).toContain('/tessdata/por.traineddata.gz');
    expect(files).toContain('/tessdata/eng.traineddata.gz');
  });

  it('takes every file of a pack with no variants', () => {
    // O inventário já é a expansão: as partes do modelo chegam prontas, sem
    // manifesto a ler.
    expect(filesForPack(packById('remove-bg'), INVENTORY, SIMD)).toEqual([
      '/model/isnet-q8.manifest.json',
      '/model/isnet-q8.onnx.part0',
      '/model/isnet-q8.onnx.part1',
      '/ort/ort-wasm-simd-threaded.mjs',
      '/ort/ort-wasm-simd-threaded.wasm',
    ]);
  });

  it('claims nothing outside its prefixes', () => {
    const pdf = filesForPack(packById('pdf-engine'), INVENTORY, SIMD);
    expect(pdf.every((path) => path.startsWith('/pdfjs/'))).toBe(true);
  });
});

describe('bytesForPack', () => {
  it('counts the chosen core only', () => {
    const ocr = packById('ocr');
    const expected = 900_000 + 3_800_000 + 1_400_000 + 2_700_000;

    expect(bytesForPack(ocr, INVENTORY, SIMD)).toBe(expected);
    // A variante relaxada é 100 kB maior; o total tem de acompanhar a escolha e
    // não somar a mesma coisa para todo navegador.
    expect(bytesForPack(ocr, INVENTORY, RELAXED)).toBe(expected + 100_000);
  });

  it('announces 55 MB for the AI pack', () => {
    expect(bytesForPack(packById('remove-bg'), INVENTORY, SIMD)).toBe(57_668_772);
  });
});

describe('stateOf', () => {
  const ocr = packById('ocr');
  const complete = new Set(filesForPack(ocr, INVENTORY, SIMD));

  it('reads absent, partial and installed', () => {
    expect(stateOf(ocr, INVENTORY, SIMD, new Set())).toBe('absent');
    expect(stateOf(ocr, INVENTORY, SIMD, complete)).toBe('installed');

    const half = new Set([...complete].slice(0, 2));
    expect(stateOf(ocr, INVENTORY, SIMD, half)).toBe('partial');
  });

  it('does not count a core variant this browser will never ask for', () => {
    // Um cache com as três variantes e mais nada não é um pacote instalado: falta
    // o worker e faltam os idiomas.
    const wrong = new Set([
      '/tesseract/tesseract-core-lstm.wasm.js',
      '/tesseract/tesseract-core-relaxedsimd-lstm.wasm.js',
    ]);
    expect(stateOf(ocr, INVENTORY, SIMD, wrong)).toBe('absent');
  });

  it('is not confused by another pack being installed', () => {
    const other = new Set(filesForPack(packById('remove-bg'), INVENTORY, SIMD));
    expect(stateOf(ocr, INVENTORY, SIMD, other)).toBe('absent');
  });
});

describe('installedBytes', () => {
  it('measures what is there, not what was promised', () => {
    const ocr = packById('ocr');
    const partial = new Set(['/tessdata/por.traineddata.gz']);

    expect(installedBytes(ocr, INVENTORY, partial)).toBe(1_400_000);
  });

  it('counts an unknown cached path as zero rather than guessing', () => {
    // Uma sobra de um deploy anterior: o inventário é a única fonte de tamanho, e
    // inventar um número para um arquivo que não está mais publicado seria pior
    // do que somar zero. A remoção apaga por prefixo, então nada fica órfão.
    const ocr = packById('ocr');
    const stale = new Set(['/tessdata/deu.traineddata.gz']);

    expect(installedBytes(ocr, INVENTORY, stale)).toBe(0);
  });
});

describe('ownedPaths', () => {
  it('includes every variant, which is what removal walks', () => {
    const paths = ownedPaths(packById('ocr'), INVENTORY);
    expect(paths.filter((p) => p.includes('tesseract-core')).length).toBe(3);
  });
});
