import { pixelBox } from './reencode';

/**
 * A gravação em si não tem teste de unidade, e é deliberado: ela precisa tocar
 * mídia real por segundos e depende de `MediaRecorder`, `captureStream` e um
 * `AudioContext` que num Karma headless não sai do estado suspenso sem gesto do
 * usuário. É o mesmo argumento que o caminho de compatibilidade do
 * `video-to-audio` registra. `48-crop-video.spec.ts` e `49-trim-video.spec.ts` cobrem isso numa janela de
 * verdade, com um vídeo sintetizado na página.
 *
 * O que TEM teste aqui é a aritmética do retângulo — que é onde mora o defeito
 * silencioso: um lado ímpar quebra só no MP4, e só em alguns navegadores.
 */
describe('pixelBox', () => {
  it('converts fractions into source pixels', () => {
    const box = pixelBox({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 800, 600);

    expect(box.x).toBe(200);
    expect(box.y).toBe(300);
    expect(box.w).toBe(400);
    expect(box.h).toBe(150);
  });

  /**
   * O H.264 EXIGE dimensões pares, e vários codificadores de VP8/VP9 recusam ou
   * distorcem um lado ímpar. Um recorte de 301 pixels falharia só no MP4, e só
   * em alguns navegadores — o defeito que aparece na máquina de outra pessoa.
   */
  it('always returns even sides', () => {
    for (const width of [301, 999, 1001, 7]) {
      const box = pixelBox({ x: 0, y: 0, w: 1, h: 1 }, width, width);

      expect(box.w % 2).withContext(`largura ${width}`).toBe(0);
      expect(box.h % 2).withContext(`altura ${width}`).toBe(0);
    }
  });

  it('rounds down to even rather than up, so it never exceeds the source', () => {
    const box = pixelBox({ x: 0, y: 0, w: 1, h: 1 }, 301, 301);

    expect(box.w).toBe(300);
    expect(box.h).toBe(300);
    expect(box.x + box.w).toBeLessThanOrEqual(301);
    expect(box.y + box.h).toBeLessThanOrEqual(301);
  });

  /** Um retângulo que começa perto da borda é puxado para dentro, não cortado. */
  it('pulls a box back inside instead of overflowing the frame', () => {
    const box = pixelBox({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 }, 800, 600);

    expect(box.x + box.w).toBeLessThanOrEqual(800);
    expect(box.y + box.h).toBeLessThanOrEqual(600);
    expect(box.w).toBeGreaterThan(0);
    expect(box.h).toBeGreaterThan(0);
  });

  it('clamps fractions outside 0..1', () => {
    const box = pixelBox({ x: -0.5, y: 2, w: 3, h: -1 }, 640, 480);

    expect(box.x).toBe(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.w).toBeLessThanOrEqual(640);
    expect(box.h).toBeGreaterThanOrEqual(2);
  });

  it('never returns a side below the two-pixel floor', () => {
    const box = pixelBox({ x: 0, y: 0, w: 0.0001, h: 0.0001 }, 100, 100);

    expect(box.w).toBeGreaterThanOrEqual(2);
    expect(box.h).toBeGreaterThanOrEqual(2);
  });

  it('keeps a full-frame selection at the full frame', () => {
    const box = pixelBox({ x: 0, y: 0, w: 1, h: 1 }, 1920, 1080);

    expect(box).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });
});
