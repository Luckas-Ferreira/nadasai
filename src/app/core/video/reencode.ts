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

/** Um intervalo de tempo em segundos, meio aberto: [start, end). */
export interface TimeRange {
  readonly start: number;
  readonly end: number;
}

export interface ReencodeOptions {
  readonly file: File;
  /** A área que fica. Ausente = o quadro inteiro. */
  readonly rect?: CropRect;
  /** O trecho que fica. Ausente = o vídeo inteiro. */
  readonly range?: TimeRange;
  readonly format?: RecordingFormat;
  /**
   * Altura máxima da SAÍDA. Ausente = o tamanho da própria área de origem.
   *
   * Reduzir resolução é metade do que "comprimir vídeo" quer dizer: baixar só
   * o bitrate de um 1080p entrega um 1080p borrado, enquanto o mesmo bitrate
   * num 720p é um 720p limpo.
   */
  readonly maxHeight?: number;
  /** Bitrate de vídeo. O padrão acompanha a área de saída. */
  readonly videoBitsPerSecond?: number;
  readonly onProgress?: (percent: number, secondsLeft: number) => void;
  readonly signal?: AbortSignal;
}

export interface ReencodedVideo {
  readonly blob: Blob;
  readonly ext: string;
  readonly width: number;
  readonly height: number;
  /** Duração do resultado, em segundos. */
  readonly duration: number;
  /** O vídeo de origem tinha trilha de áudio e ela foi para o resultado. */
  readonly hasAudio: boolean;
}

const WHOLE_FRAME: CropRect = { x: 0, y: 0, w: 1, h: 1 };

/**
 * RECODIFICAR VÍDEO — recorte de área, de tempo, ou os dois — sem demuxer e sem
 * ffmpeg.
 *
 * Uma máquina só, dois consumidores: `crop-video` passa um retângulo,
 * `trim-video` passa um intervalo, e nada impede que um dia alguém passe os
 * dois. Escrever a segunda ferramenta como uma cópia desta seria a forma mais
 * fácil de as duas discordarem sobre bitrate, sobre lados pares ou sobre o que
 * fazer com o áudio.
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
export async function reencodeVideo(options: ReencodeOptions): Promise<ReencodedVideo> {
  const { file, onProgress, signal } = options;

  if (typeof MediaRecorder === 'undefined') throw new AppError('capture_unsupported');

  const target = pickRecorderMime(options.format);
  if (!target) throw new AppError('capture_unsupported');

  const probe = await probeVideo(file);
  if (probe.width === 0 || probe.height === 0) throw new AppError('video_decode_failed');

  const box = pixelBox(options.rect ?? WHOLE_FRAME, probe.width, probe.height);
  if (box.w < 2 || box.h < 2) throw new AppError('pdf_no_regions');

  const range = clampRange(options.range, probe.duration);
  if (range.end - range.start < 0.05) throw new AppError('audio_empty_selection');

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.playsInline = true;
  video.preload = 'auto';

  const out = outputSize(box, options.maxHeight);

  const canvas = document.createElement('canvas');
  canvas.width = out.w;
  canvas.height = out.h;
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
      videoBitsPerSecond: options.videoBitsPerSecond ?? bitrateFor(out.w, out.h),
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const finished = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new AppError('capture_no_video'));
    });

    // Posiciona ANTES de começar a gravar. Buscar com o gravador em curso
    // escreveria o salto no arquivo: os quadros que passam durante a busca
    // entram, e o resultado começa com um borrão do lugar errado.
    if (range.start > 0) {
      video.currentTime = range.start;
      await once(video, 'seeked', 30_000);
    }

    stopDrawing = drawEveryFrame(video, ctx, box, out);

    recorder.start(1000);
    await video.play();

    await Promise.race([
      once(video, 'ended', (range.end - range.start + 60) * 1000),
      stopAt(video, range.end),
      abortSignal(signal),
      progressLoop(video, range, onProgress, signal),
    ]);

    video.pause();

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
      width: out.w,
      height: out.h,
      duration: range.end - range.start,
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
 * O tamanho da SAÍDA a partir da área de origem.
 *
 * Só reduz, nunca amplia: pedir 1080p de um vídeo 480p entregaria os mesmos
 * pixels ocupando um arquivo maior, que é o contrário do que qualquer um dos
 * dois consumidores quer. Os lados continuam pares pelo motivo de sempre.
 */
export function outputSize(box: { w: number; h: number }, maxHeight?: number) {
  const even = (n: number): number => Math.max(2, Math.floor(n / 2) * 2);

  if (!maxHeight || maxHeight <= 0 || box.h <= maxHeight) return { w: even(box.w), h: even(box.h) };

  const scale = maxHeight / box.h;
  return { w: even(Math.round(box.w * scale)), h: even(Math.round(box.h * scale)) };
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
  out: { w: number; h: number },
): () => void {
  let stopped = false;

  const paint = (): void => {
    if (stopped) return;
    ctx.drawImage(video, box.x, box.y, box.w, box.h, 0, 0, out.w, out.h);
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

/**
 * Progresso pelo `currentTime`, relativo ao INTERVALO e não ao arquivo.
 *
 * Cortar os últimos dez segundos de um vídeo de dez minutos precisa mostrar uma
 * barra que anda de 0 a 100 em dez segundos — e não uma que já começa em 98%.
 */
function progressLoop(
  video: HTMLVideoElement,
  range: TimeRange,
  onProgress: ReencodeOptions['onProgress'],
  signal: AbortSignal | undefined,
): Promise<never> {
  return new Promise<never>(() => {
    const span = range.end - range.start;
    if (!onProgress || span <= 0) return;

    const timer = setInterval(() => {
      if (signal?.aborted || video.ended || video.paused) {
        clearInterval(timer);
        return;
      }
      const done = Math.min(1, Math.max(0, (video.currentTime - range.start) / span));
      onProgress(Math.round(done * 100), Math.max(0, range.end - video.currentTime));
    }, 250);
  });
}

/**
 * Resolve quando a reprodução passa de `end`.
 *
 * `timeupdate` dispara a cada ~250 ms, o que basta: o gravador continua até a
 * chamada de `stop`, então alguns quadros a mais no fim são melhores do que um
 * corte antecipado. O evento é o mecanismo certo aqui porque um `setTimeout`
 * mediria o relógio da máquina e não o do vídeo — e os dois divergem assim que
 * a aba perde o foco ou a decodificação engasga.
 */
function stopAt(video: HTMLVideoElement, end: number): Promise<void> {
  return new Promise((resolve) => {
    const check = (): void => {
      if (video.currentTime >= end) {
        video.removeEventListener('timeupdate', check);
        resolve();
      }
    };
    video.addEventListener('timeupdate', check);
  });
}

/**
 * O intervalo, preso dentro do vídeo. Ausente = o arquivo inteiro.
 *
 * A duração de uma gravação de MediaRecorder chega como `Infinity` até o
 * `probeVideo` forçá-la — e se por algum motivo ela ainda vier inválida, o
 * fallback é gravar tudo, que é o comportamento sem intervalo.
 */
function clampRange(range: TimeRange | undefined, duration: number): TimeRange {
  const total = Number.isFinite(duration) && duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
  if (!range) return { start: 0, end: total };

  const start = Math.min(Math.max(0, range.start), total);
  const end = Math.min(Math.max(start, range.end), total);
  return { start, end };
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
