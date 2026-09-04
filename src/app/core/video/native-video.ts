import { PACKAGED } from '../platform/platform';
import type { CropRect, ReencodedVideo, TimeRange } from './reencode';

/**
 * O ATALHO NATIVO DO VÍDEO — o primeiro consumidor da costura de plataforma.
 *
 * `reencodeVideo` recodifica no navegador: toca o vídeo escondido, redesenha
 * cada quadro num canvas e grava com o `MediaRecorder`. Isso **leva a duração do
 * trecho**, porque áudio só se captura em tempo real. No Android existem dois
 * caminhos melhores, e o nativo escolhe entre eles:
 *
 *   * **cópia de amostra** — as amostras já comprimidas passam de um contêiner
 *     para outro. Instantâneo e SEM PERDA, mas só pode começar num quadro-chave
 *     e nunca muda o tamanho do quadro.
 *   * **recodificação** — decodifica a partir do quadro-chave anterior, descarta
 *     os quadros antes do instante pedido e recodifica o resto, no codificador
 *     de hardware. Exato ao quadro, e faz recorte de área e resolução na mesma
 *     passada, por uma textura de OpenGL.
 *
 * O áudio nunca é recodificado nos dois caminhos: quadro de AAC se decodifica
 * sozinho, então não tem o problema do quadro-chave e recodificá-lo só custaria
 * uma geração de perda.
 *
 * ── TUDO AQUI FALHA PARA O LADO SEGURO ──────────────────────────────────────
 *
 * Esta função devolve `null` sempre que não tem certeza, e `null` significa
 * "siga pelo caminho web". Ela recusa quando não está empacotada, quando a saída
 * pedida não é MP4, quando o nativo não acha a origem, quando os codecs não
 * cabem num MP4, e — como rede de segurança — se o início entregue divergir do
 * pedido. O pior caso é o comportamento de hoje; nunca um resultado diferente do
 * que a tela prometeu.
 *
 * ── POR QUE `file.name` E `file.size` E NÃO O ARQUIVO ───────────────────────
 *
 * A ponte do Capacitor é JSON. Um vídeo de 500 MB viraria ~666 MB de base64
 * atravessando a fronteira antes de o trabalho começar — mais lento que o
 * caminho que este atalho existe para substituir. Então o que atravessa é o
 * NOME, e o nativo reencontra o `content://` que ele mesmo viu passar pelo
 * seletor de arquivo. O resultado volta como CAMINHO, servido de volta ao
 * WebView por `convertFileSrc` — sem socket, que é o que permite isto funcionar
 * num app sem permissão de rede.
 */

/**
 * Quanto o início pode recuar em relação ao pedido para que a CÓPIA seja usada,
 * em segundos.
 *
 * Esta é a única política do recurso, e ela mora aqui e não no Java de
 * propósito: o mecanismo é nativo, a decisão de produto é da ferramenta. Acima
 * desta distância o nativo recodifica, o que é exato ao quadro — então o número
 * não escolhe entre "certo" e "errado", escolhe entre **sem perda** e
 * **instantâneo**.
 *
 * Zero seria defensável e desperdiça: um deslocamento de poucos milissegundos
 * não é perceptível e ainda assim jogaria fora a cópia sem perda. Um quarto de
 * segundo é onde a diferença começa a ser vista como "entrou um pedaço a mais".
 */
const KEYFRAME_TOLERANCE_SECONDS = 0.25;

/**
 * Rede de segurança do lado JS. A recodificação devolve o instante exato e a
 * cópia devolve dentro da tolerância, então isto nunca deveria disparar — e é
 * por isso que existe: se disparar, alguma suposição sobre o nativo deixou de
 * valer, e cair no caminho web é melhor do que entregar outro corte.
 */
const MAX_ACCEPTED_DRIFT_SECONDS = KEYFRAME_TOLERANCE_SECONDS + 0.01;

export interface NativeVideoRequest {
  readonly file: File;
  readonly range: TimeRange;
  readonly rect?: CropRect;
  readonly maxHeight?: number;
  readonly bitrate?: number;
  readonly wantsMp4: boolean;
  readonly onProgress?: (percent: number, secondsLeft: number) => void;
}

interface NativeVideoResult {
  readonly path: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly hasAudio: boolean;
  readonly requestedStartSeconds: number;
  readonly actualStartSeconds: number;
  readonly durationSeconds: number;
  readonly mode: 'copy' | 'transcode';
  readonly elapsedMs: number;
}

interface NadaSaiVideoPlugin {
  process(options: {
    name: string;
    size: number;
    startSeconds: number;
    endSeconds: number;
    toleranceSeconds: number;
    rectX?: number;
    rectY?: number;
    rectW?: number;
    rectH?: number;
    maxHeight?: number;
    bitrate?: number;
  }): Promise<NativeVideoResult>;
}

export async function tryNativeVideo(request: NativeVideoRequest): Promise<ReencodedVideo | null> {
  // Constante de build: no bundle da web o resto desta função é código morto e
  // o esbuild o elimina, junto com o import dinâmico do Capacitor.
  if (!PACKAGED) return null;

  // O nativo escreve MP4, e só. Pedir WebM é pedir outro contêiner, e prometer
  // um e entregar outro é a mentira que tirou o FLAC da saída do áudio.
  if (!request.wantsMp4) return null;

  const { file, range, rect, maxHeight, bitrate, onProgress } = request;

  try {
    const { Capacitor, registerPlugin } = await import('@capacitor/core');
    const plugin = registerPlugin<NadaSaiVideoPlugin>('NadaSaiVideo');

    onProgress?.(1, 0);

    const result = await plugin.process({
      name: file.name,
      size: file.size,
      startSeconds: range.start,
      endSeconds: range.end,
      toleranceSeconds: KEYFRAME_TOLERANCE_SECONDS,
      ...(rect ? { rectX: rect.x, rectY: rect.y, rectW: rect.w, rectH: rect.h } : {}),
      ...(maxHeight !== undefined ? { maxHeight } : {}),
      ...(bitrate !== undefined ? { bitrate } : {}),
    });

    const drift = Math.abs(result.actualStartSeconds - result.requestedStartSeconds);
    if (drift > MAX_ACCEPTED_DRIFT_SECONDS) {
      console.info(`[native-video] início ${drift.toFixed(2)}s fora do pedido; caminho web assume`);
      return null;
    }

    onProgress?.(90, 0);

    // O caminho volta como URL do servidor local do Capacitor, atendida por
    // `shouldInterceptRequest` a partir do disco — sem socket.
    const response = await fetch(Capacitor.convertFileSrc(result.path));
    if (!response.ok) return null;
    const blob = await response.blob();

    onProgress?.(100, 0);
    console.info(
      `[native-video] ${result.mode} em ${result.elapsedMs}ms, ${result.width}x${result.height}, ${result.bytes} bytes`,
    );

    return {
      blob,
      ext: 'mp4',
      width: result.width,
      height: result.height,
      duration: result.durationSeconds,
      hasAudio: result.hasAudio,
    };
  } catch (err) {
    // NO_SOURCE e UNSUPPORTED são respostas de projeto, não falhas: o nativo diz
    // que não é o caso dele. Qualquer outra coisa também não deve derrubar a
    // ferramenta — o caminho web sabe fazer o trabalho inteiro.
    console.info('[native-video] indisponível, seguindo pelo caminho web:', err);
    return null;
  }
}
