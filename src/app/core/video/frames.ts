import { AppError } from '../errors';
import { canvasToBlob } from '../image/image-file.util';
import { probeVideo } from './video-file.util';

/**
 * Leitura de quadros de um vídeo, sem demuxer e sem WebCodecs.
 *
 * COMO, e por que assim: um `<video>` é posicionado no instante desejado e o
 * quadro é desenhado num canvas. É a única forma que funciona nos quatro
 * navegadores hoje — WebCodecs ainda não está em todos, e um demuxer próprio
 * seria um parser de container inteiro (a mesma alternativa que `extract-audio`
 * recusou, pelo mesmo motivo).
 *
 * POR QUE POSICIONAR E NÃO TOCAR. Tocar o vídeo e capturar o que passa é mais
 * rápido, mas entrega os quadros que o navegador resolveu exibir: sob carga ele
 * pula, e a animação sai com intervalo irregular sem nada avisar. Posicionar dá
 * o quadro pedido, e o custo é tempo — que num teto de 30 segundos é aceitável.
 *
 * DUAS PASSADAS SÃO DE PROPÓSITO. Quem chama lê primeiro uma amostra esparsa
 * (para montar a paleta) e depois todos os quadros (para escrever o GIF). O
 * caminho óbvio — guardar todos os quadros da primeira passada — é o que estoura
 * a memória: 30 s a 15 fps em 480x270 são 450 quadros, e em RGBA isso passa de
 * 230 MB. Indexado, cada quadro cai para um oitavo, e é por isso que a paleta
 * precisa existir ANTES de o segundo laço começar.
 */

export interface FrameRange {
  readonly file: File;
  readonly startSec: number;
  readonly endSec: number;
  readonly fps: number;
  /** Largura alvo. A altura sai da proporção do vídeo, arredondada para par. */
  readonly width: number;
}

export interface FrameGrid {
  readonly width: number;
  readonly height: number;
  readonly count: number;
  /** Centésimos de segundo por quadro, já arredondado como o GIF exige. */
  readonly delayCs: number;
}

/** Um `<video>` pronto para ser posicionado, com o canvas de destino junto. */
interface Reader {
  readonly video: HTMLVideoElement;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly grid: FrameGrid;
  readonly timestamps: readonly number[];
  release(): void;
}

const SEEK_TIMEOUT_MS = 15_000;

/** Quantos quadros a paleta olha. Mais que isto não muda a paleta e custa tempo. */
export const PALETTE_SAMPLE_FRAMES = 12;

export function frameGridFor(
  probe: { duration: number; width: number; height: number },
  range: Omit<FrameRange, 'file'>,
): FrameGrid {
  const start = Math.max(0, Math.min(range.startSec, probe.duration));
  const end = Math.max(start, Math.min(range.endSec, probe.duration));
  const span = end - start;

  const fps = Math.max(1, Math.min(30, range.fps));
  const count = Math.max(1, Math.round(span * fps));

  const width = Math.max(2, Math.round(range.width));
  const ratio = probe.height > 0 && probe.width > 0 ? probe.height / probe.width : 9 / 16;
  // Altura par: dimensão ímpar não quebra o GIF, mas escala mal em leitor que
  // reamostra, e o custo de arredondar é zero.
  const height = Math.max(2, Math.round((width * ratio) / 2) * 2);

  return { width, height, count, delayCs: Math.max(1, Math.round(100 / fps)) };
}

async function openReader(range: FrameRange): Promise<Reader> {
  const probe = await probeVideo(range.file);
  // A grade é recalculada abaixo com as dimensões do ELEMENTO já carregado: o
  // probe pode devolver zero em arquivo sem metadado completo, e uma proporção
  // errada aqui sai como GIF esticado. O probe continua sendo quem valida
  // duração e tipo antes de qualquer leitura pesada.
  let grid = frameGridFor(probe, range);

  const start = Math.max(0, Math.min(range.startSec, probe.duration));
  const end = Math.max(start, Math.min(range.endSec, probe.duration));
  const span = end - start;

  const timestamps: number[] = [];
  for (let i = 0; i < grid.count; i++) {
    // O último quadro fica um pouco antes do fim: pedir exatamente a duração
    // devolve o fim do vídeo em alguns navegadores e um quadro preto em outros.
    const at = grid.count === 1 ? start : start + (span * i) / grid.count;
    timestamps.push(Math.min(at, Math.max(start, end - 0.001)));
  }

  const url = URL.createObjectURL(range.file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AppError('video_decode_failed')), SEEK_TIMEOUT_MS);
    video.onloadeddata = () => {
      clearTimeout(timer);
      resolve();
    };
    video.onerror = () => {
      clearTimeout(timer);
      reject(new AppError('video_decode_failed'));
    };
  });

  if (video.videoWidth > 0 && video.videoHeight > 0) {
    grid = frameGridFor(
      { duration: probe.duration, width: video.videoWidth, height: video.videoHeight },
      range,
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = grid.width;
  canvas.height = grid.height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new AppError('video_decode_failed');

  return {
    video,
    canvas,
    ctx,
    grid,
    timestamps,
    release: () => {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      video.onseeked = null;
      reject(new AppError('video_decode_failed'));
    }, SEEK_TIMEOUT_MS);

    video.onseeked = () => {
      clearTimeout(timer);
      video.onseeked = null;
      resolve();
    };

    // Posicionar no mesmo instante em que já se está NÃO dispara `seeked`, e a
    // promessa ficaria pendente para sempre — o caso acontece com um vídeo de um
    // quadro só, ou quando o passo é menor que a precisão do container.
    if (Math.abs(video.currentTime - time) < 1e-4) {
      clearTimeout(timer);
      video.onseeked = null;
      resolve();
      return;
    }

    video.currentTime = time;
  });
}

/**
 * Percorre os quadros do intervalo, entregando um por vez.
 *
 * O callback recebe o `ImageData` do quadro e pode ser assíncrono — quem escreve
 * o GIF precisa disso para ceder a thread de vez em quando e manter a barra de
 * progresso viva.
 */
export async function forEachFrame(
  range: FrameRange,
  onFrame: (frame: ImageData, index: number, grid: FrameGrid) => void | Promise<void>,
  shouldStop?: () => boolean,
): Promise<FrameGrid> {
  const reader = await openReader(range);

  try {
    for (let i = 0; i < reader.timestamps.length; i++) {
      if (shouldStop?.()) break;

      await seekTo(reader.video, reader.timestamps[i]);
      reader.ctx.drawImage(reader.video, 0, 0, reader.grid.width, reader.grid.height);

      const frame = reader.ctx.getImageData(0, 0, reader.grid.width, reader.grid.height);
      await onFrame(frame, i, reader.grid);
    }

    return reader.grid;
  } finally {
    reader.release();
  }
}

/**
 * Junta pixels de quadros ESPALHADOS pelo intervalo, para a paleta.
 *
 * Espalhados e não os primeiros: uma paleta tirada do começo do vídeo erra
 * inteira quando a cena muda — e mudar de cena é o que um recorte de vídeo faz.
 */
export async function sampleFramePixels(
  range: FrameRange,
  maxFrames = PALETTE_SAMPLE_FRAMES,
): Promise<{ pixels: Uint8ClampedArray; grid: FrameGrid }> {
  const reader = await openReader(range);

  try {
    const total = reader.timestamps.length;
    const wanted = Math.max(1, Math.min(maxFrames, total));
    const step = total / wanted;

    const perFrame = reader.grid.width * reader.grid.height * 4;
    const pixels = new Uint8ClampedArray(perFrame * wanted);

    for (let s = 0; s < wanted; s++) {
      const index = Math.min(total - 1, Math.floor(s * step));
      await seekTo(reader.video, reader.timestamps[index]);
      reader.ctx.drawImage(reader.video, 0, 0, reader.grid.width, reader.grid.height);

      const frame = reader.ctx.getImageData(0, 0, reader.grid.width, reader.grid.height);
      pixels.set(frame.data, s * perFrame);
    }

    return { pixels, grid: reader.grid };
  } finally {
    reader.release();
  }
}

/**
 * Um `<video>` aberto UMA vez, do qual se pede quadro avulso por posição.
 *
 * `forEachFrame` abre um leitor por chamada — um `probeVideo` e um decode
 * inteiros —, o que é certo para percorrer um intervalo e caro demais para uma
 * régua que pede um quadro por arrasto. Aqui o elemento fica aberto e cada
 * pedido é só uma busca, que é o que torna a troca do quadro de referência do
 * recorte instantânea depois da primeira.
 *
 * O quadro sai no tamanho NATURAL do vídeo, e isso não é detalhe: quem recorta
 * converte o retângulo desenhado em pixels do arquivo, e uma escala no meio
 * seria mais uma conversão para errar.
 */
export interface FramePicker {
  readonly width: number;
  readonly height: number;
  readonly duration: number;
  frameAt(seconds: number): Promise<Blob>;
  release(): void;
}

export async function openFramePicker(file: File): Promise<FramePicker> {
  const probe = await probeVideo(file);

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AppError('video_decode_failed')), SEEK_TIMEOUT_MS);
    video.onloadeddata = () => {
      clearTimeout(timer);
      resolve();
    };
    video.onerror = () => {
      clearTimeout(timer);
      reject(new AppError('video_decode_failed'));
    };
  });

  // As dimensões do ELEMENTO, não as do probe: o probe devolve zero em arquivo
  // sem metadado completo — foi assim que o vídeo para GIF saiu 16:9 sobre um
  // vídeo 4:3 — e aqui uma proporção errada deslocaria o recorte inteiro.
  const width = video.videoWidth || probe.width;
  const height = video.videoHeight || probe.height;
  if (width < 2 || height < 2) throw new AppError('video_decode_failed');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new AppError('video_decode_failed');

  return {
    width,
    height,
    duration: probe.duration,

    async frameAt(seconds: number): Promise<Blob> {
      // Nunca a duração exata: alguns navegadores devolvem o fim do vídeo e
      // outros um quadro preto. Mesmo cuidado do laço de quadros.
      const at = Math.min(Math.max(0, seconds), Math.max(0, probe.duration - 0.001));
      await seekTo(video, at);
      ctx.drawImage(video, 0, 0, width, height);
      return canvasToBlob(canvas, 'image/png');
    },

    release: () => {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
