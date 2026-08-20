import { frameGridFor } from './frames';

/**
 * Só a parte PURA é testada aqui, e a razão é a mesma registrada em
 * `extract-audio`: ler quadro exige mídia de verdade tocando, e o Chrome do
 * Karma não tem gesto de usuário nem decodificador de container garantido. A
 * leitura em si é coberta pelo e2e, num navegador real, com um vídeo que a
 * própria página grava.
 */
describe('frameGridFor', () => {
  const probe = { duration: 10, width: 1920, height: 1080 };

  it('derives the frame count from duration and fps', () => {
    const grid = frameGridFor(probe, { startSec: 0, endSec: 4, fps: 15, width: 480 });

    expect(grid.count).toBe(60);
    expect(grid.width).toBe(480);
    expect(grid.height).toBe(270);
  });

  /** Centésimos de segundo é a unidade do GIF; 15 fps são 6,67, e o formato só
   *  aceita inteiro. O que não pode acontecer é sair zero. */
  it('rounds the delay to whole centiseconds, never to zero', () => {
    expect(frameGridFor(probe, { startSec: 0, endSec: 1, fps: 15, width: 320 }).delayCs).toBe(7);
    expect(frameGridFor(probe, { startSec: 0, endSec: 1, fps: 30, width: 320 }).delayCs).toBe(3);
    expect(frameGridFor(probe, { startSec: 0, endSec: 1, fps: 4, width: 320 }).delayCs).toBe(25);
  });

  it('keeps the aspect ratio of the source, with an even height', () => {
    const tall = frameGridFor(
      { duration: 5, width: 1080, height: 1920 },
      { startSec: 0, endSec: 2, fps: 10, width: 270 },
    );

    expect(tall.height).toBe(480);
    expect(tall.height % 2).toBe(0);
  });

  it('clamps a range that runs past the end of the video', () => {
    const grid = frameGridFor(probe, { startSec: 8, endSec: 99, fps: 10, width: 320 });

    // Sobram 2 segundos de vídeo, não 91.
    expect(grid.count).toBe(20);
  });

  it('never asks for zero frames', () => {
    const grid = frameGridFor(probe, { startSec: 3, endSec: 3, fps: 12, width: 320 });
    expect(grid.count).toBe(1);
  });
});
