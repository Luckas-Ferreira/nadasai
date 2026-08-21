import { AppError } from '../errors';
import { pickRecorderMime, type RecordingFormat } from './screen-recorder';
import { probeVideo, readAudioHint } from './video-file.util';

/** O recorte, em fração das dimensões do vídeo (0 a 1). É o que o overlay emite. */
export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface CropVideoOptions {
  readonly file: File;
  readonly rect: CropRect;
  readonly format?: RecordingFormat;
  /** Bitrate de vídeo. O padrão acompanha a área recortada. */
  readonly videoBitsPerSecond?: number;
  readonly onProgress?: (percent: number, secondsLeft: number) => void;
  readonly signal?: AbortSignal;
}

export interface CroppedVideo {
  readonly blob: Blob;
  readonly ext: string;
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  /** O vídeo de origem tinha trilha de áudio e ela foi para o resultado. */
  readonly hasAudio: boolean;
}

/**
 * RECORTAR VÍDEO, sem demuxer e sem ffmpeg.
 *
 * O caminho é o único que o navegador oferece hoje sem trazer 25-30 MB de WASM
 * sob GPL — o mesmo argumento que manteve o ffmpeg fora do vídeo-para-GIF:
 *
 *   1. o vídeo TOCA num elemento escondido;
 *   2. cada quadro exibido é desenhado num canvas do tamanho do recorte;
 *   3. `canvas.captureStream()` transforma o canvas num fluxo de vídeo;
 *   4. o áudio da origem entra no mesmo fluxo por um
 *      `MediaStreamAudioDestinationNode`;
 *   5. o `MediaRecorder` grava os dois — a mesma API que o gravador de tela usa.
 *
 * ── O QUE ISSO CUSTA, E POR QUE É ACEITÁVEL ─────────────────────────────────
 *
 * **Leva o tempo do vídeo.** Não há como acelerar: o áudio é capturado em tempo
 * real por definição, e um `playbackRate` maior o entregaria com a duração
 * errada. É o mesmo custo que o caminho de compatibilidade do
 * `video-to-audio` já paga e ANUNCIA — a tela mostra o tempo restante e oferece
 * cancelar, em vez de parecer travada.
 *
 * **É uma segunda geração de compressão.** Recortar exige redesenhar, e
 * redesenhar exige recodificar. Um corte sem perda precisaria de um demuxer que
 * reescrevesse o contêiner mantendo os quadros — o que não existe aqui de
 * propósito.
 *
 * **AQUI NÃO SE TOCA O VÍDEO PARA O USUÁRIO OUVIR.** `createMediaElementSource`
 * desconecta o elemento da saída padrão: o som passa a ir só para onde o nó for
 * ligado, e ele é ligado apenas ao destino de fluxo. É o oposto da armadilha
 * registrada no `video-to-audio` — lá o problema era o `muted` zerar a captura,
 * aqui a captura é o único caminho que existe.
 */
export async function cropVideo(options: CropVideoOptions): Promise<CroppedVideo> {
  const { file, rect, onProgress, signal } = options;

  if (typeof MediaRecorder === 'undefined') throw new AppError('capture_unsupported');

  const target = pickRecorderMime(options.format);
  if (!target) throw new AppError('capture_unsupported');

  const probe = await probeVideo(file);
  if (probe.width === 0 || probe.height === 0) throw new AppError('video_decode_failed');

  const box = pixelBox(rect, probe.width, probe.height);
  if (box.w < 2 || box.h < 2) throw new AppError('pdf_no_regions');

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.playsInline = true;
  video.preload = 'auto';

  const canvas = document.createElement('canvas');
  canvas.width = box.w;
  canvas.height = box.h;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new AppError('video_decode_failed');

  let audioContext: AudioContext | null = null;
  let stopDrawing: (() => void) | null = null;

  try {
    await once(video, 'loadeddata', 30_000);

    const stream = canvas.captureStream();

    // Só cria contexto de áudio quando há áudio. Uma trilha silenciosa gasta
    // bytes no arquivo e um contexto aberto para nada é hardware ocupado — a
    // mesma regra que o gravador de tela segue com uma fonte só.
    const wantsAudio = readAudioHint(video) !== false;
    let hasAudio = false;

    if (wantsAudio) {
      audioContext = new AudioContext();
      const source = audioContext.createMediaElementSource(video);
      const destination = audioContext.createMediaStreamDestination();
      source.connect(destination);

      const track = destination.stream.getAudioTracks()[0];
      if (track) {
        stream.addTrack(track);
        hasAudio = true;
      }
    }

    const recorder = new MediaRecorder(stream, {
      mimeType: target.mime,
      videoBitsPerSecond: options.videoBitsPerSecond ?? bitrateFor(box.w, box.h),
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const finished = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new AppError('capture_no_video'));
    });

    stopDrawing = drawEveryFrame(video, ctx, box);

    recorder.start(1000);
    await video.play();

    const startedAt = performance.now();

    await Promise.race([
      once(video, 'ended', (probe.duration + 60) * 1000),
      abortSignal(signal),
      progressLoop(video, probe.duration, onProgress, signal),
    ]);

    stopDrawing();
    stopDrawing = null;

    if (recorder.state !== 'inactive') recorder.stop();
    await finished;

    if (signal?.aborted) throw new AppError('cancelled');

    const blob = new Blob(chunks, { type: target.mime });
    if (blob.size === 0) throw new AppError('capture_no_video');

    return {
      blob,
      ext: target.ext,
      width: box.w,
      height: box.h,
      durationMs: performance.now() - startedAt,
      hasAudio,
    };
  } finally {
    stopDrawing?.();
    video.pause();
    // Solta o arquivo antes de revogar: `load()` sem `src` interrompe a
    // decodificação em curso, e revogar com o elemento ainda lendo deixa o
    // decodificador segurando um blob que ninguém mais alcança.
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
    void audioContext?.close();
  }
}

/** O retângulo em pixels da origem, com lados PARES. */
export function pixelBox(rect: CropRect, width: number, height: number) {
  const even = (n: number): number => Math.max(2, Math.floor(n / 2) * 2);

  const x = Math.round(clamp01(rect.x) * width);
  const y = Math.round(clamp01(rect.y) * height);
  const w = even(Math.round(clamp01(rect.w) * width));
  const h = even(Math.round(clamp01(rect.h) * height));

  return {
    x: Math.min(x, Math.max(0, width - w)),
    y: Math.min(y, Math.max(0, height - h)),
    w: Math.min(w, width),
    h: Math.min(h, height),
  };
}

/**
 * Lados pares não são preciosismo: o H.264 EXIGE dimensões pares e vários
 * codificadores de VP8/VP9 recusam ou distorcem um lado ímpar. Um recorte de
 * 301 pixels de largura falharia só no MP4, e só em alguns navegadores — o tipo
 * de defeito que aparece na máquina de outra pessoa.
 */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Bitrate que acompanha a área. Um recorte de 300x300 gravado a 6 Mbps é um
 * arquivo enorme com qualidade que ninguém vê; a conta abaixo dá cerca de
 * 2,5 Mbps para 720p e escala com o número de pixels.
 */
function bitrateFor(width: number, height: number): number {
  const pixels = width * height;
  return Math.round(Math.min(8_000_000, Math.max(600_000, pixels * 2.7)));
}

/**
 * Desenha o recorte a cada quadro EXIBIDO.
 *
 * `requestVideoFrameCallback` é o certo quando existe: ele dispara uma vez por
 * quadro decodificado, então nem se perde quadro num vídeo de 60 fps nem se
 * redesenha o mesmo quadro num de 24. O `requestAnimationFrame` é a rede para
 * quem ainda não o implementa, e ali o custo é redesenhar de novo o que já está
 * lá — inofensivo, porque o fluxo do canvas só amostra o que mudou.
 */
function drawEveryFrame(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
): () => void {
  let stopped = false;

  const paint = (): void => {
    if (stopped) return;
    ctx.drawImage(video, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  };

  const withVideoFrame = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
  };

  if (typeof withVideoFrame.requestVideoFrameCallback === 'function') {
    let handle = 0;
    const step = (): void => {
      paint();
      if (!stopped) handle = withVideoFrame.requestVideoFrameCallback!(step);
    };
    handle = withVideoFrame.requestVideoFrameCallback(step);

    return () => {
      stopped = true;
      withVideoFrame.cancelVideoFrameCallback?.(handle);
    };
  }

  let raf = 0;
  const step = (): void => {
    paint();
    if (!stopped) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}

/** Progresso pelo `currentTime`, que é a única medida honesta em tempo real. */
function progressLoop(
  video: HTMLVideoElement,
  duration: number,
  onProgress: CropVideoOptions['onProgress'],
  signal: AbortSignal | undefined,
): Promise<never> {
  return new Promise<never>(() => {
    if (!onProgress || duration <= 0) return;

    const timer = setInterval(() => {
      if (signal?.aborted || video.ended) {
        clearInterval(timer);
        return;
      }
      const done = Math.min(1, video.currentTime / duration);
      onProgress(Math.round(done * 100), Math.max(0, duration - video.currentTime));
    }, 250);
  });
}

function once(target: EventTarget, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new AppError('video_decode_failed'));
    }, timeoutMs);

    const onEvent = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new AppError('video_decode_failed'));
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener('error', onError);
    };

    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener('error', onError, { once: true });
  });
}

function abortSignal(signal: AbortSignal | undefined): Promise<void> {
  if (!signal) return new Promise<void>(() => {});
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
}
