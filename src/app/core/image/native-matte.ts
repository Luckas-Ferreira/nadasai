import { PACKAGED } from '../platform/platform';

/**
 * O ATALHO NATIVO DA REMOÇÃO DE FUNDO — o segundo consumidor da costura de
 * plataforma, e o mais direto dos dois.
 *
 * `BackgroundRemovalService` roda o IS-Net no onnxruntime-web, e o número de
 * threads sai de `crossOriginIsolated`. **No WebView isso é sempre `false`**, e
 * não por falta de cabeçalho: o COOP/COEP chega ao documento e o WebView
 * continua sem `SharedArrayBuffer`, porque ele não faz isolamento de origem (o
 * Chrome do mesmo aparelho faz — medido, e registrado no `MainActivity.java`).
 * Uma thread, então, para a conta mais pesada que o produto tem.
 *
 * O nativo roda o MESMO modelo int8, na MESMA resolução, com a MESMA
 * normalização — só que no ONNX Runtime nativo e com todos os núcleos. Não é uma
 * segunda qualidade de recorte; é a mesma, mais rápida.
 *
 * ── TUDO AQUI FALHA PARA O LADO SEGURO ──────────────────────────────────────
 *
 * Devolve `null` sempre que não tem certeza, e `null` significa "siga pelo
 * caminho WASM", que continua inteiro no APK justamente por isto. Recusa quando
 * não está empacotado, quando a ponte não responde, quando a máscara volta com
 * aresta diferente da pedida e quando qualquer coisa lança. O pior caso é o
 * comportamento de hoje — lento —, nunca um recorte diferente do que a tela
 * prometeu.
 *
 * ── POR QUE OS BYTES ATRAVESSAM AQUI, E NO VÍDEO NÃO ────────────────────────
 *
 * `native-video.ts` manda o NOME do arquivo porque um vídeo de 500 MB viraria
 * ~666 MB de base64. Aqui o que atravessa não é o arquivo: é o quadrado de
 * 1024×1024 que o serviço já desenhava para montar o tensor (~1-2 MB em PNG) e a
 * máscara de volta (1 MB em 8 bits). Some tudo e é menos do que uma foto de
 * celular — e, diferente do caminho por nome, funciona para arquivo que veio da
 * cadeia, do gravador ou de qualquer porta que não seja o seletor do sistema,
 * que é a maioria dos casos desta ferramenta.
 *
 * Nada disso encosta em disco, dos dois lados: a máscara é derivada da foto de
 * quem usa, e num produto chamado "Nada Sai" ela não sobra no cache do aparelho.
 */

interface NativeMatteResult {
  readonly mask: string;
  readonly size: number;
  readonly threads: number;
  readonly elapsedMs: number;
}

interface NadaSaiMattePlugin {
  warm(): Promise<{ ready: boolean; threads?: number; elapsedMs?: number }>;
  matte(options: { image: string }): Promise<NativeMatteResult>;
}

/**
 * O proxy do plugin NUNCA pode ser o valor com que uma promise resolve — que é o
 * que o `native-video.ts` já respeitava sem precisar dizer por quê (ele o guarda
 * numa const local), e aqui precisou ser dito.
 *
 * `registerPlugin` devolve um Proxy que transforma toda propriedade lida numa
 * chamada da ponte, e resolver uma promise com ele faz o motor ler `.then` para
 * saber se é um thenable. O proxy responde: a ponte recebe `then()`, não acha o
 * método, e o que aparece no console é
 * `"NadaSaiMatte.then() is not implemented on android"` — um erro que nomeia um
 * método que ninguém escreveu, longe da linha que o causou. Medido no emulador,
 * antes de a inferência ter rodado uma vez.
 *
 * O embrulho `{ api }` existe só por isso, e não é enfeite: a promise passa a
 * resolver com um objeto comum e o proxy fica DENTRO dele, onde ninguém procura
 * `.then`. Desfazer o embrulho recria o defeito.
 *
 * E é memoizado porque `registerPlugin` chamado duas vezes com o mesmo nome
 * avisa `"already registered. Cannot register plugins twice."` e devolve o proxy
 * que já existia — funciona, e enche o console de um aviso que parece defeito na
 * próxima vez que alguém for ler esse log atrás de outra coisa.
 */
let bridge: Promise<{ readonly api: NadaSaiMattePlugin }> | undefined;

function registerMatte(): Promise<{ readonly api: NadaSaiMattePlugin }> {
  bridge ??= import('@capacitor/core').then(({ registerPlugin }) => ({
    api: registerPlugin<NadaSaiMattePlugin>('NadaSaiMatte'),
  }));
  return bridge;
}

/**
 * Monta a sessão nativa antes de existir foto.
 *
 * `true` significa "a sessão está de pé, não aqueça o WASM". Ler 44 MB do APK e
 * montar o grafo custa segundos, e é exatamente o que `ModelPrefetchService` já
 * fazia com os pesos na web — a diferença é que aqui não há download nenhum, só
 * o aquecimento.
 */
export async function warmNativeMatte(): Promise<boolean> {
  // Constante de build: no bundle da web o resto desta função é código morto e o
  // esbuild o elimina, junto com o import dinâmico do Capacitor.
  if (!PACKAGED) return false;

  try {
    const { api } = await registerMatte();
    const result = await api.warm();
    if (result.ready) console.info(`[native-matte] sessão pronta em ${result.elapsedMs}ms, ${result.threads} threads`);
    return result.ready;
  } catch (err) {
    console.info('[native-matte] aquecimento indisponível, o WASM assume:', err);
    return false;
  }
}

/**
 * Roda a inferência no nativo e devolve a máscara em 0..1, no mesmo formato que
 * a saída do WASM tem depois de lida do tensor.
 *
 * A máscara volta do nativo já normalizada por min-max, porque a saída do IS-Net
 * é ilimitada e quantizá-la crua em 8 bits jogaria quase toda a rampa num valor
 * só. O `applyMask` re-normaliza por cima, o que sobre 0..1 é idempotente — então
 * os dois caminhos entregam a mesma imagem, e nenhum dos dois precisa saber por
 * onde o outro passou.
 */
export async function tryNativeMatte(
  square: HTMLCanvasElement,
  size: number,
  onProgress?: (percent: number) => void,
): Promise<Float32Array | null> {
  if (!PACKAGED) return null;

  try {
    const image = await toBase64Png(square);

    // O marco fica DEPOIS da guarda de plataforma, e é por isso que ele é
    // parâmetro em vez de uma linha no serviço: na web o download dos 44 MB é
    // quem ocupa a faixa de 5 a 60, e a barra do componente nunca anda para trás
    // (`Math.max(toward, creep, 0)`). Anunciar 60 antes de saber que o nativo
    // existe apagaria o progresso real do download para todo mundo que não está
    // no app. Aqui não há download nenhum: os pesos vêm do APK.
    onProgress?.(60);

    const { api } = await registerMatte();
    const result = await api.matte({ image });

    if (result.size !== size) {
      // Nunca deveria disparar, e é por isso que existe: uma máscara com a
      // aresta errada produz um recorte deslocado, que parece defeito do modelo.
      console.info(`[native-matte] máscara ${result.size}² fora de ${size}²; caminho WASM assume`);
      return null;
    }

    const bytes = atob(result.mask);
    const expected = size * size;
    if (bytes.length !== expected) {
      console.info(`[native-matte] máscara com ${bytes.length} de ${expected} amostras; caminho WASM assume`);
      return null;
    }

    const mask = new Float32Array(expected);
    for (let i = 0; i < expected; i++) mask[i] = bytes.charCodeAt(i) / 255;

    console.info(`[native-matte] inferência em ${result.elapsedMs}ms, ${result.threads} threads`);
    return mask;
  } catch (err) {
    console.info('[native-matte] indisponível, seguindo pelo caminho WASM:', err);
    return null;
  }
}

/** PNG sem perda: o modelo lê este quadrado, e artefato de JPEG aqui vira franja na borda do cabelo. */
function toBase64Png(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('canvas não codificou'));
        return;
      }

      // FileReader e não `btoa(String.fromCharCode(...))`: são megabytes, e o
      // spread estoura o limite de argumentos da chamada muito antes disso.
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('leitura falhou'));
      reader.onload = () => {
        const url = String(reader.result);
        const comma = url.indexOf(',');
        if (comma < 0) reject(new Error('data URL inesperada'));
        else resolve(url.slice(comma + 1));
      };
      reader.readAsDataURL(blob);
    }, 'image/png');
  });
}
