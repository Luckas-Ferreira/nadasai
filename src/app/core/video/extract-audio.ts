import { AppError } from '../errors';
import { readAudioHint, type VideoProbe } from './video-file.util';

/**
 * Tirar a trilha de áudio de um vídeo, sem servidor e sem demuxer embarcado.
 *
 * Há dois caminhos, e a ordem entre eles é a decisão inteira deste arquivo:
 *
 * 1. `decodeAudioData` com o arquivo de vídeo cru. Parece errado — é a API de
 *    áudio — mas Chrome, Edge e Safari demuxam o container e devolvem só a
 *    trilha de áudio, na velocidade do disco e sem perda nenhuma. Quando
 *    funciona, é a resposta certa: exato, e mais rápido que tempo real por uma
 *    ordem de grandeza.
 *
 * 2. Capturar tocando. Quando (1) falha — e o Firefox é o motivo pelo qual isto
 *    existe: o pipeline dele recusa `decodeAudioData` em vários containers com
 *    faixa de vídeo — o áudio é lido do próprio `<video>` por um
 *    AudioWorklet, amostra por amostra. Custa o tempo do vídeo, o que é caro e
 *    é dito na tela; em troca ainda é PCM exato, sem recodificação.
 *
 * O que NÃO está aqui, deliberadamente: um demuxer MP4 + WebCodecs. Resolveria
 * o caso (2) em segundos em vez de minutos, mas custa uma dependência de
 * parsing de container, mais um caminho de codec para configurar o
 * `AudioDecoder`, e um terceiro conjunto de modos de falha — para cobrir os
 * navegadores em que o caminho (1) já não funciona, que é a minoria. Se um dia
 * a captura em tempo real virar a reclamação principal, é por aqui que se
 * troca: `extractAudioTrack` é a única porta.
 *
 * MediaRecorder foi descartado como plano B pelo motivo oposto: gravaria em
 * Opus, ou seja, uma recodificação com perda no meio de uma ferramenta que
 * oferece WAV sem perda. Um WAV gerado a partir de Opus é uma mentira do mesmo
 * tipo que um PNG com extensão .avif.
 */

/** Quadros que o worklet acumula antes de mandar para a thread principal. */
const CHUNK_FRAMES = 16_384;

const CAPTURE_PROCESSOR = 'nadasai-capture';

/**
 * Estéreo explícito na captura: um 5.1 desce para dois canais pela regra de
 * downmix da própria spec, e um mono sobe para dois idênticos — que
 * `collapseIdenticalChannels` desfaz no fim. Sem isso, a contagem de canais
 * seria o que a fonte tivesse e a saída deixaria de casar com a do caminho 1.
 */
const CAPTURE_CHANNELS = 2;

export type ExtractStage = 'reading' | 'decoding' | 'capturing';

export interface ExtractProgress {
  readonly stage: ExtractStage;
  /** `null` enquanto o navegador decodifica: não há como consultar o andamento. */
  readonly percent: number | null;
}

export interface ExtractOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ExtractProgress) => void;
}

export interface ExtractedAudio {
  readonly buffer: AudioBuffer;
  /** Verdadeiro quando foi preciso tocar o vídeo inteiro para capturar. */
  readonly realtime: boolean;
}

/**
 * Colapsa canais bit a bit idênticos em um só.
 *
 * A captura em tempo real força dois canais, então uma gravação mono — a voz de
 * uma reunião, uma aula — sairia como estéreo falso e ocuparia o dobro em WAV,
 * ao contrário do mesmo arquivo pelo caminho rápido. Comparar por amostragem em
 * passo primo em vez de varrer tudo mantém isto em O(n/97) sem chance real de
 * falso positivo: dois canais diferentes divergem em milhares de posições, não
 * em nenhuma das ~5 mil testadas.
 */
export function collapseIdenticalChannels(channels: readonly Float32Array[]): Float32Array[] {
  if (channels.length < 2) return [...channels];

  const frames = channels[0].length;
  const step = 97;

  for (let ch = 1; ch < channels.length; ch++) {
    if (channels[ch].length !== frames) return [...channels];
    for (let i = 0; i < frames; i += step) {
      if (channels[ch][i] !== channels[0][i]) return [...channels];
    }
  }

  return [channels[0]];
}

export async function extractAudioTrack(
  file: File,
  probe: VideoProbe,
  options: ExtractOptions = {},
): Promise<ExtractedAudio> {
  throwIfAborted(options.signal);

  // O caminho rápido detacha o ArrayBuffer que recebe, então uma falha aqui não
  // deixa nada reaproveitável para o caminho 2 — que também não precisa: ele lê
  // o arquivo pelo próprio elemento de mídia.
  try {
    const buffer = await decodeWholeFile(file, options);
    if (buffer.length > 0) return { buffer, realtime: false };
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.warn('[extract-audio] decodeAudioData recusou o container, capturando em tempo real:', err);
  }

  throwIfAborted(options.signal);
  const buffer = await captureAudioWhilePlaying(file, probe, options);
  return { buffer, realtime: true };
}

// ---------------------------------------------------------------- caminho 1

async function decodeWholeFile(file: File, options: ExtractOptions): Promise<AudioBuffer> {
  options.onProgress?.({ stage: 'reading', percent: null });
  const bytes = await file.arrayBuffer();

  throwIfAborted(options.signal);
  options.onProgress?.({ stage: 'decoding', percent: null });

  const ctx = newAudioContext();
  try {
    // Contexto real, não OfflineAudioContext, para que a taxa de amostragem seja
    // a do dispositivo — a mesma que cut-audio, merge-audio e convert-audio
    // produzem. Um arquivo extraído aqui e cortado lá tem que ser o mesmo áudio.
    return await ctx.decodeAudioData(bytes);
  } finally {
    void ctx.close();
  }
}

// ---------------------------------------------------------------- caminho 2

/**
 * Exportada, e não privada, porque é a metade do arquivo que nenhum teste
 * alcançaria de outro jeito: o Chrome — o único navegador que roda a suíte —
 * sempre resolve pelo caminho 1, então passar por `extractAudioTrack` jamais
 * exercitaria o worklet, o flush do resto do buffer nem a alocação prévia. Esta
 * é a porta que `extract-audio.spec.ts` usa para testar o modo compatível com um
 * arquivo de verdade.
 */
export async function captureAudioWhilePlaying(
  file: File,
  probe: VideoProbe,
  options: ExtractOptions = {},
): Promise<AudioBuffer> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.playsInline = true;
  // NÃO usar `video.muted`: em várias implementações mutar o elemento zera
  // também a saída do MediaElementAudioSourceNode, e capturaríamos silêncio. O
  // silêncio de verdade vem do ganho zero antes do destino, mais abaixo.
  video.volume = 1;
  video.src = url;

  const ctx = newAudioContext();
  const workletUrl = URL.createObjectURL(
    new Blob([processorSource()], { type: 'text/javascript' }),
  );

  // Espaço para o arquivo inteiro, alocado uma vez. Acumular pedaços numa lista
  // e concatenar no fim mantém as duas cópias vivas ao mesmo tempo — 1,4 GB de
  // pico numa gravação de 30 minutos, o dobro do necessário.
  const capacity = Math.ceil((probe.duration + 2) * ctx.sampleRate);
  const captured: Float32Array[] = [];
  for (let ch = 0; ch < CAPTURE_CHANNELS; ch++) captured.push(new Float32Array(capacity));
  let written = 0;

  let cleanup = () => {
    /* substituído assim que os nós existem */
  };

  try {
    await ctx.audioWorklet.addModule(workletUrl);
    await ctx.resume();

    const source = ctx.createMediaElementSource(video);
    const capture = new AudioWorkletNode(ctx, CAPTURE_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [CAPTURE_CHANNELS],
      channelCount: CAPTURE_CHANNELS,
      channelCountMode: 'explicit',
    });

    // Um nó só é processado se estiver ligado ao destino, mesmo que não produza
    // nada — sem esta ponte o `process()` nunca é chamado. O ganho zero é o que
    // impede que o vídeo saia pelos alto-falantes enquanto extrai.
    const silence = ctx.createGain();
    silence.gain.value = 0;
    source.connect(capture);
    capture.connect(silence);
    silence.connect(ctx.destination);

    cleanup = () => {
      try {
        source.disconnect();
        capture.disconnect();
        silence.disconnect();
        capture.port.onmessage = null;
      } catch {
        /* o contexto pode já ter caído; nada a salvar */
      }
    };

    await new Promise<void>((resolve, reject) => {
      const signal = options.signal;

      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        signal?.removeEventListener('abort', onAbort);
        video.pause();
        fn();
      };

      const onAbort = () => finish(() => reject(new AppError('cancelled')));
      signal?.addEventListener('abort', onAbort);

      // Rede de segurança para um `ended` que nunca chega — acontece com
      // duração declarada errada no container. Um minuto de folga sobre o
      // tempo do próprio vídeo.
      const watchdog = setTimeout(
        () => finish(() => reject(new AppError('video_decode_failed'))),
        probe.duration * 1000 + 60_000,
      );

      capture.port.onmessage = (event: MessageEvent) => {
        const data = event.data as { channels?: Float32Array[]; done?: boolean };

        if (data.done) {
          finish(resolve);
          return;
        }
        if (!data.channels) return;

        const frames = Math.min(data.channels[0].length, capacity - written);
        if (frames <= 0) return;

        for (let ch = 0; ch < CAPTURE_CHANNELS; ch++) {
          const incoming = data.channels[ch] ?? data.channels[0];
          captured[ch].set(incoming.subarray(0, frames), written);
        }
        written += frames;
      };

      video.ontimeupdate = () => {
        options.onProgress?.({
          stage: 'capturing',
          percent: Math.min(99, Math.round((video.currentTime / probe.duration) * 100)),
        });
      };

      // O worklet segura até 16 384 quadros por vez; sem o flush, os últimos
      // ~0,34 s do arquivo ficariam para trás.
      video.onended = () => capture.port.postMessage({ flush: true });
      video.onerror = () => finish(() => reject(new AppError('video_decode_failed')));

      options.onProgress?.({ stage: 'capturing', percent: 0 });
      video.play().catch((err) => finish(() => reject(new AppError('video_decode_failed', err))));
    });
  } finally {
    cleanup();
    video.onended = null;
    video.onerror = null;
    video.ontimeupdate = null;
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
    URL.revokeObjectURL(workletUrl);
    void ctx.close();
  }

  if (written === 0) {
    // Tocou o arquivo inteiro e não veio uma amostra: ou não há trilha de áudio,
    // ou o navegador não sabe decodificar a que existe. A dica do elemento é a
    // única coisa que separa as duas, e quando ela não existe a mensagem
    // genérica é a honesta.
    throw new AppError(probe.hasAudio === false ? 'video_no_audio' : 'video_decode_failed');
  }

  const trimmed = captured.map((data) => data.subarray(0, written));
  const channels = collapseIdenticalChannels(trimmed);

  const out = newAudioContext();
  try {
    const buffer = out.createBuffer(channels.length, written, out.sampleRate);
    for (let ch = 0; ch < channels.length; ch++) buffer.copyToChannel(channels[ch], ch);
    return buffer;
  } finally {
    void out.close();
  }
}

// ---------------------------------------------------------------- worklet

function processorSource(): string {
  return `
class NadaSaiCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = null;
    this.filled = 0;
    this.port.onmessage = (event) => {
      if (event.data && event.data.flush) {
        this.emit();
        this.port.postMessage({ done: true });
      }
    };
  }

  alloc(channelCount) {
    this.chunk = [];
    for (let ch = 0; ch < channelCount; ch++) this.chunk.push(new Float32Array(${CHUNK_FRAMES}));
    this.filled = 0;
  }

  emit() {
    if (!this.chunk || this.filled === 0) return;
    // slice() copia: os buffers transferidos não podem ser os de trabalho, ou o
    // próximo process() escreveria em memória já detachada.
    const out = this.chunk.map((data) => data.slice(0, this.filled));
    this.port.postMessage({ channels: out }, out.map((data) => data.buffer));
    this.filled = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) return true;

    if (!this.chunk || this.chunk.length !== input.length) {
      this.emit();
      this.alloc(input.length);
    }

    const frames = input[0].length;
    let read = 0;
    while (read < frames) {
      const take = Math.min(${CHUNK_FRAMES} - this.filled, frames - read);
      for (let ch = 0; ch < input.length; ch++) {
        this.chunk[ch].set(input[ch].subarray(read, read + take), this.filled);
      }
      this.filled += take;
      read += take;
      if (this.filled === ${CHUNK_FRAMES}) this.emit();
    }
    return true;
  }
}

registerProcessor('${CAPTURE_PROCESSOR}', NadaSaiCapture);
`;
}

// ---------------------------------------------------------------- utilitários

function newAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctor();
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AppError('cancelled');
}

export { readAudioHint };
