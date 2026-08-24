import { AppError } from '../../core/errors';

/** Uma hora. Teto de TAMANHO de arquivo, não de memória — ver o comentário abaixo. */
export const MAX_RECORDING_SECONDS = 60 * 60;

export interface VoiceFormat {
  readonly mime: string;
  readonly ext: string;
  readonly label: string;
}

/**
 * O que este navegador sabe ESCREVER em áudio, na ordem de preferência.
 *
 * Nada aqui é escolha nossa: o formato é o `mimeType` com que o `MediaRecorder`
 * é CONSTRUÍDO, e não há recodificação depois. Anunciar MP3 numa lista que o
 * navegador não escreve seria prometer um arquivo que nunca aparece — é a
 * mesma regra que tirou o FLAC da saída do conversor e o AVIF da do de imagem.
 *
 * Nenhum navegador grava MP3 nativamente, então a lista real é Opus em WebM e
 * AAC em MP4. Quem quiser MP3 converte na ferramenta ao lado, que é para isso
 * que a cadeia existe.
 */
const CANDIDATES: readonly VoiceFormat[] = [
  { mime: 'audio/webm;codecs=opus', ext: 'webm', label: 'WEBM' },
  { mime: 'audio/webm', ext: 'webm', label: 'WEBM' },
  { mime: 'audio/mp4;codecs=mp4a.40.2', ext: 'm4a', label: 'M4A' },
  { mime: 'audio/mp4', ext: 'm4a', label: 'M4A' },
];

export function availableVoiceFormats(): readonly VoiceFormat[] {
  if (typeof MediaRecorder === 'undefined') return [];

  const found: VoiceFormat[] = [];
  for (const candidate of CANDIDATES) {
    if (!MediaRecorder.isTypeSupported(candidate.mime)) continue;
    // Deduplicado por EXTENSÃO, como o gravador de tela faz por contêiner: os
    // dois primeiros candidatos são a mesma escolha com e sem o codec dito, e
    // mostrar "WEBM" duas vezes exporia um detalhe que não é decisão de
    // ninguém.
    if (found.some((f) => f.ext === candidate.ext)) continue;
    found.push(candidate);
  }

  return found;
}

/**
 * O GRAVADOR, e ele é uma classe simples de propósito.
 *
 * Nunca `providedIn: 'root'`. O argumento é o mesmo que o `ScreenRecorder`
 * registra e aqui é ainda mais grave: um `MediaStream` de MICROFONE vivo dentro
 * de um singleton continua ouvindo depois que a pessoa saiu da ferramenta. Num
 * produto chamado Nada Sai esse é o pior defeito possível, e a única defesa
 * estrutural é o objeto morrer junto com a tela.
 */
export class VoiceRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private format: VoiceFormat | null = null;

  async start(format: VoiceFormat): Promise<void> {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new AppError('capture_unsupported');
    }

    // O navegador é quem pergunta, e a recusa vem como exceção. Traduzida aqui
    // para o código que a tela sabe explicar, em vez de virar um erro cru.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new AppError('mic_denied');
    }

    this.stream = stream;
    this.format = format;
    this.chunks = [];

    const recorder = new MediaRecorder(stream, { mimeType: format.mime });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };

    this.recorder = recorder;
    // Pedaços de um segundo: os `Blob`s vão para o disco pelo navegador, e é
    // isso que faz o teto de uma hora ser de tamanho de ARQUIVO e não de
    // memória — uma hora de voz não vive na heap.
    recorder.start(1000);
  }

  stop(): Promise<Blob> {
    const recorder = this.recorder;
    const format = this.format;
    if (!recorder || !format) return Promise.reject(new AppError('capture_no_video'));

    return new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: format.mime });
        this.release();
        if (blob.size === 0) reject(new AppError('capture_no_video'));
        else resolve(blob);
      };

      recorder.onerror = () => {
        this.release();
        reject(new AppError('capture_no_video'));
      };

      recorder.stop();
    });
  }

  /** Solta o microfone. Chamar duas vezes é seguro, e a tela chama ao destruir. */
  release(): void {
    this.recorder = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}

/** O gravador de tela e o de voz respondem à mesma pergunta de suporte. */
export function canRecordAudio(): boolean {
  return availableVoiceFormats().length > 0;
}
