import { expect, test, type Page } from '@playwright/test';
import { NOT_AN_IMAGE, openApp, pickFromHome, primary, upload } from './helpers';

const PATH = '/pt/audio/extrair-de-video';

/** Probe + decode of the whole file happen off the main thread. */
const READY = { timeout: 45_000 };

/**
 * The fixture is a REAL video with a real audio track, synthesised in the page.
 *
 * There is no hand-rolled MP4 encoder in this repo and there should not be one:
 * a canvas stream plus an oscillator through MediaRecorder produces a genuine
 * WebM — container, video track, Opus audio — with no binary committed and no
 * dependency added, exactly like `fixtures/generate.ts` hand-rolls its PNG.
 *
 * It also happens to be the meanest input available: a live recording carries no
 * duration in its header, so `video.duration` reads `Infinity` until the element
 * is seeked to the end. That is the shape of every screen recording anyone will
 * ever drop here, and the probe has to cope with it.
 */
async function makeVideo(page: Page, seconds = 3): Promise<Buffer> {
  // Autoplay policy: an AudioContext started with no user activation stays
  // suspended and would record pure silence, which the test would then blame on
  // the extractor.
  await page.mouse.click(5, 5);

  const base64 = await page.evaluate(async (duration) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(30);

    const audio = new AudioContext();
    await audio.resume();
    const osc = audio.createOscillator();
    osc.frequency.value = 440;
    const gain = audio.createGain();
    gain.gain.value = 0.3;
    const dest = audio.createMediaStreamDestination();
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    stream.addTrack(dest.stream.getAudioTracks()[0]);

    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.start();
    const painter = setInterval(() => {
      ctx.fillStyle = `hsl(${(Date.now() / 10) % 360}, 70%, 50%)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }, 33);

    await new Promise((resolve) => setTimeout(resolve, duration * 1000));
    clearInterval(painter);
    recorder.stop();
    await stopped;
    osc.stop();
    void audio.close();

    const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, seconds);

  return Buffer.from(base64, 'base64');
}

async function dropVideo(page: Page, name = 'gravacao.webm'): Promise<void> {
  const buffer = await makeVideo(page);
  expect(buffer.byteLength).toBeGreaterThan(1000);

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name, mimeType: 'video/webm', buffer });
}

/**
 * Scoped to the action bar: handing the result to the audio chain raises the
 * persistent file bar, which carries a "Baixar" of its own — the bare role query
 * matches two buttons and fails on strict mode rather than on the behaviour.
 */
async function expectDownload(page: Page, pattern: RegExp): Promise<void> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('app-action-bar').getByRole('button', { name: 'Baixar' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(pattern);
}

test.describe('Extrair áudio de vídeo', () => {
  test('extracts the track from a video the browser itself recorded', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    // The waveform image is the proof that samples actually came out — a page
    // that merely stopped spinning would pass a weaker assertion.
    await expect(page.getByAltText('Trilha de áudio extraída')).toBeVisible(READY);
    await expect(page.locator('video')).toBeVisible();

    // A live recording declares no duration; the probe has to find the real one.
    await expect(page.getByText(/0:0[23]/).first()).toBeVisible();
  });

  test('encodes to MP3 and names the file from the video', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);
    await expect(page.getByAltText('Trilha de áudio extraída')).toBeVisible(READY);

    await primary(page, 'Extrair áudio').click();
    await expect(page.locator('app-action-bar').getByRole('button', { name: 'Baixar' })).toBeVisible(
      READY,
    );

    await expectDownload(page, /^gravacao-audio\.mp3$/);
  });

  test('re-offers the run only when a setting changes, and WAV really writes WAV', async ({
    page,
  }) => {
    await openApp(page, PATH);
    await dropVideo(page);
    await expect(page.getByAltText('Trilha de áudio extraída')).toBeVisible(READY);

    await primary(page, 'Extrair áudio').click();
    await expect(page.locator('app-action-bar').getByRole('button', { name: 'Baixar' })).toBeVisible(
      READY,
    );

    // Same settings: pressing it again could only produce identical bytes.
    await expect(primary(page, 'Extrair áudio')).toBeHidden();

    await page.getByRole('radio', { name: 'WAV' }).click();
    await expect(primary(page, 'Extrair áudio')).toBeVisible();

    await primary(page, 'Extrair áudio').click();
    await expect(page.locator('app-action-bar').getByRole('button', { name: 'Baixar' })).toBeVisible(
      READY,
    );
    // The extension has to follow the encoder, not the label. A WAV named .mp3 —
    // or the reverse — is the AVIF bug this codebase already paid for once.
    await expectDownload(page, /^gravacao-audio\.wav$/);
  });

  test('hands the extracted audio to the cutter', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);
    await expect(page.getByAltText('Trilha de áudio extraída')).toBeVisible(READY);

    await primary(page, 'Extrair áudio').click();

    // Sem "Continuar editando": a extração entrega o áudio à sessão sozinha (o
    // `handOff` chama `apply`), então não há resultado pendente para aceitar — e
    // esta ferramenta come vídeo, não áudio, de modo que "continuar AQUI" nunca
    // foi o que ela oferece. O botão de baixar é o sinal de que já terminou.
    await expect(page.locator('app-action-bar').getByRole('button', { name: 'Baixar' })).toBeVisible(
      READY,
    );

    // Pela home, e nunca por `page.goto`: a cadeia é um signal em memória, então
    // um carregamento de verdade apagaria justamente a entrega que se quer
    // provar — e o teste culparia a ferramenta pelo reload.
    //
    // A ida até a home é obrigatória: extrair áudio mora no módulo VÍDEO (o
    // módulo é o que a ferramenta recebe, não o que ela devolve), então o trilho
    // ao lado lista vídeo e o cortador não está a um clique dali.
    await page.getByRole('link', { name: 'Nada Sai' }).first().click();
    await pickFromHome(page, 'Cortar áudio');

    // The cutter reads the chain on construction: the waveform appearing with no
    // upload is the hand-off working.
    await expect(page.locator('canvas')).toBeVisible(READY);
  });

  /**
   * O modo compatível, que nenhum Chrome alcança sozinho.
   *
   * `decodeAudioData` é feito recusar o arquivo, que é exatamente o que o
   * Firefox faz com vários containers com faixa de vídeo — e é a única razão de
   * a captura em tempo real existir. Sem forçar isto, ~150 linhas (o worklet, o
   * flush do resto do buffer, a alocação prévia, o cancelamento) viajariam sem
   * cobertura nenhuma.
   */
  test('falls back to capturing while playing when the fast path is refused', async ({ page }) => {
    await page.addInitScript(() => {
      const original = AudioContext.prototype.decodeAudioData;
      let refused = false;
      AudioContext.prototype.decodeAudioData = function (this: AudioContext, ...args: unknown[]) {
        if (!refused) {
          refused = true;
          return Promise.reject(new Error('forced: container refused'));
        }
        return (original as (...a: unknown[]) => Promise<AudioBuffer>).apply(this, args);
      } as typeof original;
    });

    await openApp(page, PATH);
    await dropVideo(page);

    // A tela tem que dizer o que está acontecendo e oferecer a saída: são
    // minutos de espera num vídeo real, e um spinner mudo seria travamento.
    // Ancorado na frase inteira: a FAQ da própria página explica o modo
    // compatível, então "Modo compatível" sozinho casa com dois elementos.
    await expect(page.getByText(/Modo compatível: capturando/)).toBeVisible(READY);
    await expect(page.getByRole('button', { name: 'Cancelar' })).toBeVisible();

    // Leva o tempo do vídeo — 3 s de fixture — e sai o mesmo PCM.
    await expect(page.getByAltText('Trilha de áudio extraída')).toBeVisible(READY);
    await expect(page.getByText(/Capturado em modo compatível/)).toBeVisible();

    await primary(page, 'Extrair áudio').click();
    await expect(page.locator('app-action-bar').getByRole('button', { name: 'Baixar' })).toBeVisible(
      READY,
    );
    await expectDownload(page, /^gravacao-audio\.mp3$/);
  });

  test('rejects a file that is not a video', async ({ page }) => {
    await openApp(page, PATH);
    // `accept` is a filter, not a guarantee — "All files" is one click away and
    // a drop bypasses it entirely.
    await upload(page, NOT_AN_IMAGE);

    await expect(page.getByRole('alert')).toContainText('não é um vídeo');
    await expect(page.getByAltText('Trilha de áudio extraída')).toHaveCount(0);
  });
});
