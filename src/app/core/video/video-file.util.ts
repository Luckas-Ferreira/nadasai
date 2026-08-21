import { AppError } from '../errors';

/**
 * O que o seletor de arquivos oferece e o que o portão de drop aceita.
 *
 * A lista é deliberadamente mais larga do que qualquer navegador sozinho
 * decodifica — não existe consulta de capacidade confiável para container de
 * vídeo, então o único teste honesto é tentar abrir e mapear a falha para
 * `video_decode_failed`. Estreitar para "o que o Chrome faz" esconderia do
 * seletor arquivos que o Firefox abre perfeitamente.
 *
 * As extensões acompanham os MIME types pelo mesmo motivo do módulo de áudio:
 * o Windows entrega `.mkv` e `.avi` com `type` vazio com frequência suficiente
 * para que um filtro só por MIME os deixe invisíveis na janela de escolha.
 */
export const ACCEPTED_VIDEO_MIME = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
  'video/x-m4v',
  'video/mpeg',
  'video/ogg',
  'video/3gpp',
  'video/x-msvideo',
  'video/avi',
] as const;

export const ACCEPT_VIDEO_ATTR = [
  ...ACCEPTED_VIDEO_MIME,
  '.mp4',
  '.m4v',
  '.mov',
  '.webm',
  '.mkv',
  '.avi',
  '.ogv',
  '.3gp',
  '.mpg',
  '.mpeg',
].join(',');

/**
 * Cinco vezes o teto do módulo de áudio, porque um vídeo É cinco vezes maior
 * pelo mesmo minuto de som — e recusar um MP4 de 200 MB para extrair 3 MB de
 * áudio seria recusar exatamente o caso que traz a pessoa aqui.
 *
 * O que este número protege é o caminho rápido, que precisa do arquivo inteiro
 * como ArrayBuffer para entregar ao `decodeAudioData`. O teto REAL de memória é
 * a duração, não os bytes: veja `MAX_VIDEO_SECONDS`.
 */
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

/**
 * O teto de memória, e é ele que decide.
 *
 * O PCM decodificado é float de 32 bits: 30 minutos de estéreo a 48 kHz são
 * ~690 MB residentes, e a codificação aloca a saída por cima disso. O limite de
 * bytes sozinho não protege nada aqui — um MP4 de 500 MB pode ter 10 minutos ou
 * 3 horas, dependendo só do bitrate do vídeo, que é a parte que vamos jogar
 * fora.
 *
 * Por isso a duração é medida ANTES de qualquer alocação, com um `<video>` que
 * lê só os metadados (`probeVideo`). Um arquivo longo demais é recusado sem
 * nunca ter sido lido inteiro.
 */
export const MAX_VIDEO_SECONDS = 30 * 60;

export function isSupportedVideo(file: File): boolean {
  if ((ACCEPTED_VIDEO_MIME as readonly string[]).includes(file.type)) return true;
  // `type` vazio ou inventado é comum em .mkv/.avi no Windows; cai no nome.
  return /\.(mp4|m4v|mov|webm|mkv|avi|ogv|3gp|mpe?g)$/i.test(file.name);
}

/** Portão de entrada: tipo e bytes. A duração só é conhecida depois do probe. */
export function assertUsableVideo(file: File): void {
  if (!isSupportedVideo(file)) throw new AppError('video_unsupported');
  if (file.size > MAX_VIDEO_BYTES) throw new AppError('video_too_large');
}

export interface VideoProbe {
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  /**
   * `true`/`false` quando o navegador sabe dizer, `null` quando não expõe a
   * informação (o caso do Chrome). Serve para transformar "não deu" em "esse
   * vídeo não tem trilha de áudio", que é uma mensagem que resolve o problema
   * da pessoa em vez de só relatar a falha — nunca para decidir se vale tentar.
   */
  readonly hasAudio: boolean | null;
}

interface AudioAwareVideo extends HTMLVideoElement {
  readonly mozHasAudio?: boolean;
  readonly audioTracks?: { readonly length: number };
  readonly webkitAudioDecodedByteCount?: number;
}

/** O que o navegador sabe sobre a trilha, com os três dialetos que existem. */
export function readAudioHint(element: HTMLVideoElement): boolean | null {
  const video = element as AudioAwareVideo;
  if (typeof video.mozHasAudio === 'boolean') return video.mozHasAudio;
  if (video.audioTracks) return video.audioTracks.length > 0;
  if (typeof video.webkitAudioDecodedByteCount === 'number') {
    // Só é conclusivo depois de decodificar algo; antes disso é sempre 0, o que
    // significa "ainda não sei", não "não tem".
    return video.webkitAudioDecodedByteCount > 0 ? true : null;
  }
  return null;
}

/**
 * Lê duração, dimensões e a pista de áudio SEM carregar o arquivo na memória.
 *
 * É o primeiro passo de propósito: com a duração na mão dá para recusar um
 * arquivo de 3 horas antes de alocar meio giga de ArrayBuffer, e a falha em
 * carregar os metadados já responde "esse container o seu navegador não abre"
 * sem gastar nada.
 */
export function probeVideo(file: File, timeoutMs = 30_000): Promise<VideoProbe> {
  return new Promise<VideoProbe>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      fn();
    };

    const timer = setTimeout(
      () => finish(() => reject(new AppError('video_decode_failed'))),
      timeoutMs,
    );

    const settle = (duration: number) => {
      if (!Number.isFinite(duration) || duration <= 0) {
        finish(() => reject(new AppError('video_decode_failed')));
        return;
      }
      if (duration > MAX_VIDEO_SECONDS) {
        finish(() => reject(new AppError('video_too_long')));
        return;
      }
      /**
       * LER ANTES DE `finish`, e este era um defeito de verdade.
       *
       * `finish` limpa o `src` e chama `load()` para soltar o arquivo — e o
       * algoritmo de carga do elemento zera `videoWidth`, `videoHeight` e as
       * pistas de áudio na hora. Como a leitura estava DENTRO do callback
       * passado para ele, o probe devolvia 0x0 para todo vídeo, sempre. Ninguém
       * tinha notado porque o único consumidor era o extrator de áudio, que usa
       * apenas a duração; o defeito apareceu quando o vídeo para GIF passou a
       * calcular a altura pela proporção e um vídeo 4:3 saiu em 16:9.
       */
      const done = () => {
        const width = video.videoWidth;
        const height = video.videoHeight;
        const hasAudio = readAudioHint(video);

        finish(() => resolve({ duration, width, height, hasAudio }));
      };

      // DIMENSÃO ZERO NÃO É "vídeo sem imagem": é metadado que ainda não chegou.
      //
      // Com `preload="metadata"`, um WebM de MediaRecorder — gravação de tela,
      // câmera, reunião — costuma disparar `loadedmetadata` antes de o elemento
      // saber o tamanho do quadro. Quem só queria a duração (extrair áudio) não
      // notava; o vídeo para GIF usa a proporção para calcular a altura, e um
      // zero aqui fazia o GIF sair em 16:9 sobre um vídeo 4:3. Esperar o
      // primeiro quadro custa nada e devolve o número certo.
      if (video.videoWidth > 0) {
        done();
        return;
      }

      video.onloadeddata = () => {
        video.onloadeddata = null;
        done();
      };
      video.preload = 'auto';
      video.load();
    };

    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) {
        settle(video.duration);
        return;
      }

      // Duração `Infinity` NÃO é arquivo corrompido: é o que todo WebM saído de
      // um MediaRecorder traz — gravação de tela, câmera do navegador, captura
      // de reunião — porque quem grava ao vivo não sabe onde vai parar e o
      // cabeçalho fica sem o campo. Recusar isso seria recusar justamente a
      // gravação que a pessoa quer transformar em áudio.
      //
      // O jeito de descobrir o tamanho real é mandar o elemento buscar um ponto
      // absurdamente adiante: ele para no fim, e aí `duration` passa a valer.
      video.onseeked = () => {
        video.onseeked = null;
        const duration = video.duration;
        video.currentTime = 0;
        settle(duration);
      };
      video.currentTime = 1e101;
    };

    video.onerror = () => finish(() => reject(new AppError('video_decode_failed')));

    video.src = url;
  });
}
