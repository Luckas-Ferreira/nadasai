import { TestBed } from '@angular/core/testing';
import { ALPHA_CUTOFF } from '../../../core/vector/alpha';
import { VectorizerService } from './vectorizer.service';

/**
 * O serviço é a única camada onde a transparência pode ser perdida antes de o
 * pipeline sequer começar — e foi exatamente ali que ela se perdia: um
 * `fillRect` branco antes do `drawImage`, com a justificativa de que o
 * vetorizador tratava a imagem como opaca. O núcleo tem teste próprio
 * (`vectorize.spec.ts`), e nenhum deles pegaria essa linha.
 */
describe('VectorizerService', () => {
  let service: VectorizerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VectorizerService);
  });

  /** PNG de verdade, com um disco opaco no meio e o resto transparente. */
  async function cutoutPng(size = 64): Promise<File> {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgb(200, 40, 60)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 4, 0, Math.PI * 2);
    ctx.fill();

    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
    return new File([blob], 'cutout.png', { type: 'image/png' });
  }

  it('não pinta fundo branco atrás de um PNG recortado', async () => {
    const { rgba, width, height } = await service.sourcePixels(await cutoutPng());

    const at = (x: number, y: number, ch: number): number => rgba[(y * width + x) * 4 + ch];

    expect(at(1, 1, 3)).withContext('alfa no canto').toBeLessThan(ALPHA_CUTOFF);
    expect(at(width - 2, height - 2, 3)).toBeLessThan(ALPHA_CUTOFF);
    expect(at(width / 2, height / 2, 3)).withContext('alfa no disco').toBe(255);
  });

  /**
   * E o RGB debaixo do transparente não pode ser preto: ele vira uma cor de
   * verdade para o quantizador e uma borda falsa para o filtro que preserva
   * aresta. `bleedTransparentColors` copia a cor do objeto para lá.
   */
  it('leva a cor do objeto para debaixo da área transparente', async () => {
    const { rgba, width } = await service.sourcePixels(await cutoutPng());

    // Logo fora do disco (raio 16 num quadro de 64): ainda dentro do alcance do
    // vazamento, transparente, e já com a cor do objeto embaixo.
    const x = 32 + 18;
    const y = 32;
    const i = (y * width + x) * 4;

    expect(rgba[i + 3]).toBeLessThan(ALPHA_CUTOFF);
    expect(rgba[i]).withContext('vermelho vazado').toBeGreaterThan(100);
    expect(rgba[i + 1] + rgba[i + 2]).withContext('e não preto').toBeGreaterThan(0);
  });
});
