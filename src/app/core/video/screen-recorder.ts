import { AppError } from '../errors';

/**
 * Gravar a tela sem servidor, sem plugin e sem dependência.
 *
 * `getDisplayMedia` + `MediaRecorder` é a resposta inteira, e as duas são APIs
 * do próprio navegador: o seletor de fonte é do CHROME, não deste site, o que
 * significa que a permissão é mediada por quem a pessoa já confia e que nada
 * aqui pode capturar nada sem ela escolher explicitamente o que compartilhar.
 * Combinado com o medidor de rede, esta é provavelmente a demonstração mais
 * direta da premissa do produto: uma gravação de tela inteira que não gera um
 * único byte de saída.
 *
 * **Isto é uma classe comum, possuída pelo componente — nunca `providedIn:
 * 'root'`.** Pelo mesmo motivo documentado no `AudioEngine`, e aqui com uma
 * consequência bem pior: um `MediaStream` de captura vivo num singleton continua
 * gravando a tela depois que a pessoa saiu da ferramenta. Num produto chamado
 * "Nada Sai", esse é o pior bug possível, e a única defesa estrutural é o objeto
 * morrer com a view.
 *
 * O que NÃO está aqui, deliberadamente: WebCodecs para reencodar, overlay de
 * webcam e recorte de região. Os três são features de edição em cima de um vídeo
 * que este arquivo já sabe produzir, e nenhum deles muda o caminho de captura —
 * então eles pertencem a ferramentas do módulo de vídeo, não a esta classe.
 */

/**
 * Teto de gravação.
 *
 * Não é memória: os pedaços do `MediaRecorder` viram `Blob`, que o navegador
 * lastreia em disco, então uma hora de tela não mora no heap. É o tamanho do
 * arquivo e o tempo de quem esqueceu a aba aberta — a 2,5 Mbps, sessenta minutos
 * já são ~1,1 GB para baixar. A parada é automática e anunciada no painel, em vez
 * de a pessoa descobrir o limite quando ele chegar.
 */
export const MAX_RECORDING_MS = 60 * 60 * 1000;

/** Com que frequência os pedaços saem do recorder para o array de blobs. */
const TIMESLICE_MS = 2000;

export type RecordingQuality = 'high' | 'medium' | 'low';

/**
 * O contêiner do arquivo, e a escolha é limitada ao que o navegador ESCREVE.
 *
 * Não há reencode aqui (ver o cabeçalho): o formato não é uma conversão depois
 * da gravação, é o `mimeType` com que o `MediaRecorder` nasce. Por isso a lista
 * oferecida à pessoa sai de `availableRecorderFormats()` e não desta união —
 * anunciar MP4 num Firefox, que só escreve WebM, seria prometer um arquivo que
 * não vai existir.
 */
export type RecordingFormat = 'webm' | 'mp4';

export interface RecorderOptions {
  /** O som do que está sendo mostrado. O Chrome só oferece para aba e tela inteira. */
  readonly systemAudio: boolean;
  readonly microphone: boolean;
  readonly quality: RecordingQuality;
  readonly format: RecordingFormat;
}

export interface Recording {
  readonly blob: Blob;
  /** A extensão que casa com o que o navegador REALMENTE escreveu. */
  readonly ext: string;
  readonly durationMs: number;
}

const BITRATES: Record<RecordingQuality, number> = {
  high: 6_000_000,
  medium: 2_500_000,
  low: 1_000_000,
};

const FRAME_RATES: Record<RecordingQuality, number> = {
  high: 30,
  medium: 30,
  low: 15,
};

export interface RecorderFormat {
  readonly format: RecordingFormat;
  readonly mime: string;
  readonly ext: string;
}

/**
 * Os candidatos, em ordem de preferência.
 *
 * VP9 antes de VP8 pela metade do bitrate na mesma qualidade; MP4 depois porque
 * durante anos só o Safari o escreveu — hoje o Chrome também, e é por isso que
 * a escolha passou a ser oferecida em vez de decidida aqui. A ordem continua
 * valendo como PADRÃO: WebM é o que todo navegador que grava sabe escrever.
 *
 * Nada disto pode virar constante de módulo consultada na carga: `MediaRecorder`
 * não existe no Node da geração estática, e uma chamada em escopo de módulo
 * derruba a rota inteira antes de existir componente (é a armadilha que
 * `TESSERACT_PATHS` já custou).
 */
const MIME_CANDIDATES: readonly RecorderFormat[] = [
  { format: 'webm', mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
  { format: 'webm', mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
  { format: 'webm', mime: 'video/webm', ext: 'webm' },
  { format: 'mp4', mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
  { format: 'mp4', mime: 'video/mp4', ext: 'mp4' },
];

/**
 * Um item por contêiner que este navegador escreve, na ordem de preferência.
 *
 * Deduplicado por `format` de propósito: os três candidatos WebM existem para
 * cair do VP9 para o VP8 e daí para o genérico, o que é escolha de CODEC e não
 * interessa a ninguém — a pergunta que a ferramenta faz é ".webm ou .mp4", e
 * oferecer três WebM seria expor o fallback como se fosse opção.
 */
export function availableRecorderFormats(): readonly RecorderFormat[] {
  if (typeof MediaRecorder === 'undefined') return [];

  const found: RecorderFormat[] = [];
  for (const candidate of MIME_CANDIDATES) {
    if (found.some((f) => f.format === candidate.format)) continue;
    if (MediaRecorder.isTypeSupported(candidate.mime)) found.push(candidate);
  }
  return found;
}

/**
 * O formato pedido, ou o melhor que houver.
 *
 * O fallback não é zelo: a lista da tela é montada quando a ferramenta abre e o
 * `MediaRecorder` é construído quando a gravação começa. Um navegador que perca
 * o suporte entre um e outro faria a gravação falhar por um `mimeType` que ele
 * mesmo acabou de recusar, em vez de gravar no formato que ainda escreve.
 */
export function pickRecorderMime(preferred?: RecordingFormat): RecorderFormat | null {
  const available = availableRecorderFormats();
  return available.find((f) => f.format === preferred) ?? available[0] ?? null;
}

/** Se dá para gravar aqui. Falso em todo iOS: nem Safari nem Chrome expõem a API. */
export function isScreenRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function' &&
    pickRecorderMime() !== null
  );
}

export class ScreenRecorder {
  private recorder: MediaRecorder | null = null;
  private display: MediaStream | null = null;
  private mic: MediaStream | null = null;
  private mixed: MediaStream | null = null;
  private context: AudioContext | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private format = { mime: '', ext: 'webm' };

  /**
   * Chamado quando a gravação termina sem ser pelo botão daqui: a pessoa clicou
   * em "Parar compartilhamento" na barra do próprio navegador, ou o teto de
   * tempo chegou. Sem isto a tela continuaria mostrando "gravando" para sempre.
   */
  onAutoStop: (() => void) | null = null;

  /** Verdadeiro quando o microfone foi pedido e recusado — a gravação segue sem ele. */
  micRefused = false;

  private limit: ReturnType<typeof setTimeout> | null = null;

  get active(): boolean {
    return this.recorder?.state === 'recording';
  }

  async start(options: RecorderOptions): Promise<void> {
    if (!isScreenRecordingSupported()) throw new AppError('capture_unsupported');

    const format = pickRecorderMime(options.format);
    if (!format) throw new AppError('capture_unsupported');
    this.format = format;

    try {
      this.display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: FRAME_RATES[options.quality] },
        audio: options.systemAudio,
      });
    } catch (err) {
      // Fechar o seletor sem escolher chega como NotAllowedError, igual a negar a
      // permissão. Não há como distinguir, e inventar a distinção seria o mesmo
      // erro que o bloco de cripto em errors.ts documenta.
      throw new AppError('capture_denied', err);
    }

    const video = this.display.getVideoTracks()[0];
    if (!video) {
      this.dispose();
      throw new AppError('capture_no_video');
    }

    if (options.microphone) {
      try {
        this.mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        // Recusar o microfone não invalida a gravação — a tela é o conteúdo. O
        // painel avisa; abortar aqui perderia a permissão de captura que a pessoa
        // acabou de conceder e a obrigaria a escolher a fonte de novo.
        this.micRefused = true;
      }
    }

    const audio = this.buildAudioTrack();
    this.mixed = new MediaStream(audio ? [video, audio] : [video]);

    this.recorder = new MediaRecorder(this.mixed, {
      mimeType: format.mime,
      videoBitsPerSecond: BITRATES[options.quality],
    });
    this.chunks = [];
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };

    // Parar o compartilhamento pela barra do navegador é a forma MAIS comum de
    // encerrar uma gravação, não um caso de borda: é o botão que fica na frente
    // da pessoa a gravação inteira.
    video.addEventListener('ended', () => this.autoStop());

    this.startedAt = performance.now();
    this.recorder.start(TIMESLICE_MS);
    this.limit = setTimeout(() => this.autoStop(), MAX_RECORDING_MS);
  }

  /** Milissegundos desde o início, para o cronômetro do painel. */
  elapsed(): number {
    return this.startedAt ? performance.now() - this.startedAt : 0;
  }

  /**
   * O stream para a prévia na tela — o de captura, sem a faixa de áudio.
   *
   * Sem áudio de propósito: um `<video>` tocando o som do sistema que ele mesmo
   * está capturando realimenta num assobio. O `muted` no elemento cobre isso, e
   * não mandar a faixa é a segunda tranca.
   */
  previewStream(): MediaStream | null {
    const video = this.display?.getVideoTracks()[0];
    return video ? new MediaStream([video]) : null;
  }

  /**
   * Encerra e devolve o arquivo.
   *
   * Espera o `stop` do recorder em vez de ler `chunks` na hora: o último pedaço
   * só é entregue nesse evento, então uma leitura imediata perde até dois
   * segundos de vídeo — o mesmo motivo pelo qual o worklet de `extract-audio`
   * precisa do flush explícito.
   */
  async stop(): Promise<Recording> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') {
      return { blob: new Blob(this.chunks, { type: this.format.mime }), ext: this.format.ext, durationMs: 0 };
    }

    const durationMs = this.elapsed();

    const blob = await new Promise<Blob>((resolve) => {
      recorder.addEventListener(
        'stop',
        () => resolve(new Blob(this.chunks, { type: this.format.mime })),
        { once: true },
      );
      recorder.stop();
    });

    this.releaseStreams();
    return { blob, ext: this.format.ext, durationMs };
  }

  /** Solta tudo. Idempotente, porque o componente chama no destroy aconteça o que acontecer. */
  dispose(): void {
    if (this.limit !== null) clearTimeout(this.limit);
    this.limit = null;

    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop();
      } catch {
        // Já parado por outro caminho; nada a fazer.
      }
    }
    this.recorder = null;
    this.releaseStreams();
    this.chunks = [];
  }

  /**
   * Uma faixa de áudio só, seja qual for a combinação.
   *
   * Com as duas fontes é preciso um grafo: `MediaStream` aceita várias faixas de
   * áudio, mas o `MediaRecorder` grava só a primeira — juntar as duas num
   * `MediaStream` e torcer produz um vídeo com o som do sistema e sem a voz, o
   * que só se descobre depois de gravar. Com uma fonte só, nenhum AudioContext é
   * criado: reamostrar sem necessidade é perda de qualidade de graça.
   */
  private buildAudioTrack(): MediaStreamTrack | null {
    const system = this.display?.getAudioTracks() ?? [];
    const mic = this.mic?.getAudioTracks() ?? [];

    if (system.length === 0 && mic.length === 0) return null;
    if (system.length === 0) return mic[0];
    if (mic.length === 0) return system[0];

    this.context = new AudioContext();
    const destination = this.context.createMediaStreamDestination();
    this.context.createMediaStreamSource(new MediaStream([system[0]])).connect(destination);
    this.context.createMediaStreamSource(new MediaStream([mic[0]])).connect(destination);
    return destination.stream.getAudioTracks()[0];
  }

  private autoStop(): void {
    if (!this.active) return;
    this.onAutoStop?.();
  }

  private releaseStreams(): void {
    if (this.limit !== null) clearTimeout(this.limit);
    this.limit = null;

    for (const stream of [this.display, this.mic, this.mixed]) {
      for (const track of stream?.getTracks() ?? []) track.stop();
    }
    this.display = null;
    this.mic = null;
    this.mixed = null;

    void this.context?.close();
    this.context = null;
  }
}
