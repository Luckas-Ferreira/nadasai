package com.nada.sai;

import android.content.Context;
import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.FloatBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Set;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

/**
 * O IS-Net rodando NATIVO, e a razao de existir e uma so: o WebView nao tem
 * threads.
 *
 * `background-removal.service.ts` decide o numero de threads do WASM por
 * `crossOriginIsolated`, e no WebView isso e `false` — nao por falta de
 * cabecalho (veja {@link MainActivity}, onde isso foi MEDIDO), mas porque o
 * WebView nao faz isolamento de origem. Sem `SharedArrayBuffer` o onnxruntime-web
 * cai para UMA thread, e o mesmo recorte que leva segundos no desktop leva
 * dezenas no aparelho. Nenhum cabecalho reverte isso; so sair do WebView.
 *
 * Aqui a inferencia e a mesma — mesmo modelo int8, mesma normalizacao, mesma
 * resolucao — rodando no ONNX Runtime nativo (MIT), com todos os nucleos.
 *
 * ── O MODELO VEM DO APK, EM PARTES ──────────────────────────────────────────
 *
 * Os pesos ja estao empacotados em `assets/public/model/`, fatiados em partes de
 * ~22 MiB porque o Cloudflare Pages recusa arquivo unico acima de 25 MiB. O
 * `manifest.json` e lido em vez de as partes serem listadas aqui: a fatia e do
 * `scripts/fetch-model.mjs`, e uma lista escrita a mao neste arquivo seria a
 * segunda chance de as duas discordarem no dia em que o modelo mudar de tamanho.
 *
 * ── O QUE ATRAVESSA A PONTE ─────────────────────────────────────────────────
 *
 * Diferente do video, aqui os bytes ATRAVESSAM, e cabem: o que entra e um PNG de
 * 1024x1024 (o quadrado que o JS ja desenhava para montar o tensor), e o que
 * volta e a mascara de 1024x1024 em 8 bits — 1 MB cru. Nao ha arquivo temporario
 * em disco NENHUM dos dois lados, e isso e deliberado: a mascara e um derivado da
 * foto de quem usa, e num produto chamado "Nada Sai" ela nao deve sobrar no
 * cache do aparelho depois que a aba fechou.
 *
 * A mascara volta ja NORMALIZADA (min-max) porque a saida do IS-Net nao e
 * probabilidade — e ilimitada. Normalizar antes de quantizar em 8 bits e o que
 * preserva a rampa; quantizar a saida crua jogaria quase toda ela num valor so.
 * O `applyMask` do JS re-normaliza por cima, o que e idempotente sobre 0..1 —
 * entao os dois caminhos entregam a mesma imagem.
 */
final class MatteEngine {

    private static final String TAG = "NadaSaiMatte";

    /**
     * Os tres numeros abaixo sao COPIA do `background-removal.service.ts`, e
     * precisam continuar sendo. O IS-Net foi treinado a 1024x1024 com media 0,5
     * e variancia unitaria; desviar disso degrada a mascara em vez de falhar,
     * que e o pior tipo de divergencia — ninguem ve nos dois primeiros recortes.
     */
    private static final int SIZE = 1024;
    private static final float MEAN = 0.5f;
    private static final float STD = 1.0f;

    private static final String MANIFEST = "public/model/isnet-q8.manifest.json";
    private static final String MODEL_DIR = "public/model/";

    /**
     * Mesma politica do WASM (`Math.min(4, hardwareConcurrency)`), e o teto e o
     * que importa: num big.LITTLE, espalhar por todos os nucleos coloca parte da
     * conta nos pequenos e a passada inteira espera por eles.
     */
    private static final int MAX_THREADS = 4;

    private static volatile OrtSession session;
    private static volatile String inputName;
    private static int threads;

    private MatteEngine() {}

    /**
     * Constroi a sessao uma vez, e so.
     *
     * Ler 44 MB do APK e montar o grafo custa segundos, entao isto e chamado
     * pelo prefetch enquanto a pessoa ainda esta escolhendo a foto — que e
     * exatamente o que `ModelPrefetchService` ja fazia com os pesos na web.
     * Chamar duas vezes nao custa nada.
     */
    static synchronized void warm(Context context) throws IOException, ai.onnxruntime.OrtException {
        if (session != null) return;

        long began = System.nanoTime();
        byte[] model = readModel(context.getAssets());

        threads = Math.max(1, Math.min(MAX_THREADS, Runtime.getRuntime().availableProcessors()));

        OrtEnvironment env = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions options = new OrtSession.SessionOptions();
        options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        options.setIntraOpNumThreads(threads);

        // Sem NNAPI, e isso e decisao e nao esquecimento: ela foi DEPRECIADA no
        // Android 15, e um modelo int8 quase nunca particiona inteiro nela — o
        // grafo volta partido entre acelerador e CPU e as transferencias comem o
        // que o acelerador economiza. E o mesmo motivo que tirou o WebGPU do
        // caminho web, registrado no servico. Se um dia for medido, e aqui.
        OrtSession built = env.createSession(model, options);

        inputName = first(built.getInputNames());
        session = built;

        Log.i(TAG, "sessao pronta em " + millisSince(began) + "ms, " + threads + " threads");
    }

    /**
     * Roda a inferencia sobre um PNG de 1024x1024 e devolve a mascara em 8 bits,
     * ja normalizada, uma amostra por pixel em ordem de linha.
     */
    static byte[] matte(Context context, byte[] png) throws IOException, ai.onnxruntime.OrtException {
        warm(context);

        float[] chw = toTensor(png);
        int pixels = SIZE * SIZE;

        OrtEnvironment env = OrtEnvironment.getEnvironment();
        try (OnnxTensor input = OnnxTensor.createTensor(env, FloatBuffer.wrap(chw), new long[] { 1, 3, SIZE, SIZE });
             OrtSession.Result result = session.run(Collections.singletonMap(inputName, input))) {

            // O IS-Net exporta saidas laterais alem da principal; a primeira e a
            // que o caminho web usa (`outputNames[0]`), e trocar por outra muda a
            // mascara sem quebrar nada.
            OnnxTensor output = (OnnxTensor) result.get(0);
            float[] raw = new float[pixels];
            output.getFloatBuffer().get(raw);

            return quantise(raw);
        }
    }

    static int threads() {
        return threads;
    }

    /** Min-max e depois 8 bits. Veja o cabecalho: a saida do modelo e ilimitada. */
    private static byte[] quantise(float[] raw) {
        float lo = Float.POSITIVE_INFINITY;
        float hi = Float.NEGATIVE_INFINITY;
        for (float v : raw) {
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }

        float span = hi - lo;
        if (span <= 0f) span = 1f;

        byte[] mask = new byte[raw.length];
        for (int i = 0; i < raw.length; i++) {
            int value = Math.round(((raw[i] - lo) / span) * 255f);
            mask[i] = (byte) Math.max(0, Math.min(255, value));
        }
        return mask;
    }

    /**
     * PNG -> RGB planar normalizado (NCHW), que e o que o IS-Net espera.
     *
     * `inPremultiplied = false` nao e detalhe: o `getImageData` do canvas devolve
     * RGBA NAO pre-multiplicado, e o caminho web le R, G e B ignorando o alfa.
     * Um bitmap pre-multiplicado (o padrao do Android) entregaria as cores ja
     * escurecidas pelo alfa em toda imagem com transparencia, e a mascara sairia
     * diferente da do navegador sobre o MESMO arquivo.
     */
    private static float[] toTensor(byte[] png) {
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inPremultiplied = false;

        Bitmap decoded = BitmapFactory.decodeByteArray(png, 0, png.length, options);
        if (decoded == null) throw new IllegalArgumentException("imagem ilegivel");

        Bitmap bitmap = decoded;
        if (bitmap.getWidth() != SIZE || bitmap.getHeight() != SIZE) {
            // Rede de seguranca: o JS ja manda o quadrado no tamanho certo. Se
            // um dia parar de mandar, redimensionar aqui e melhor do que rodar o
            // modelo fora da resolucao em que ele foi treinado.
            bitmap = Bitmap.createScaledBitmap(decoded, SIZE, SIZE, true);
        }

        int pixels = SIZE * SIZE;
        int[] argb = new int[pixels];
        bitmap.getPixels(argb, 0, SIZE, 0, 0, SIZE, SIZE);

        if (bitmap != decoded) bitmap.recycle();
        decoded.recycle();

        float[] chw = new float[3 * pixels];
        for (int i = 0; i < pixels; i++) {
            int p = argb[i];
            chw[i] = (((p >> 16) & 0xFF) / 255f - MEAN) / STD;
            chw[pixels + i] = (((p >> 8) & 0xFF) / 255f - MEAN) / STD;
            chw[2 * pixels + i] = ((p & 0xFF) / 255f - MEAN) / STD;
        }
        return chw;
    }

    /** Remonta as partes do APK na ordem do manifesto. Byte a byte igual ao .onnx original. */
    private static byte[] readModel(AssetManager assets) throws IOException {
        JSONObject manifest;
        try {
            manifest = new JSONObject(readText(assets, MANIFEST));
        } catch (org.json.JSONException e) {
            throw new IOException("manifesto do modelo ilegivel", e);
        }

        try {
            byte[] model = new byte[manifest.getInt("bytes")];
            JSONArray parts = manifest.getJSONArray("parts");

            int offset = 0;
            for (int i = 0; i < parts.length(); i++) {
                offset += readInto(assets, MODEL_DIR + parts.getString(i), model, offset);
            }

            if (offset != model.length) {
                throw new IOException("modelo incompleto: " + offset + " de " + model.length);
            }
            return model;
        } catch (org.json.JSONException e) {
            throw new IOException("manifesto do modelo sem bytes/parts", e);
        }
    }

    /**
     * A condicao de parada e o BUFFER CHEIO, e nao so o fim do fluxo.
     *
     * `InputStream.read(b, off, 0)` devolve **0**, nunca -1: pedir zero byte nao
     * e uma pergunta sobre o fim do arquivo. Entao um laco que so sai em -1
     * roda para sempre no instante em que a ultima parte completa o buffer — sem
     * excecao, sem log, com a thread em estado R queimando um nucleo. Medido no
     * emulador: sete minutos girando antes de a sessao chegar a existir.
     */
    private static int readInto(AssetManager assets, String path, byte[] destination, int offset) throws IOException {
        int remaining = destination.length - offset;
        int written = 0;

        try (InputStream in = assets.open(path)) {
            while (written < remaining) {
                int read = in.read(destination, offset + written, remaining - written);
                if (read < 0) break;
                written += read;
            }
        }
        return written;
    }

    private static String readText(AssetManager assets, String path) throws IOException {
        try (InputStream in = assets.open(path)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            for (int read = in.read(buffer); read >= 0; read = in.read(buffer)) {
                out.write(buffer, 0, read);
            }
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }

    private static String first(Set<String> names) {
        for (String name : names) return name;
        throw new IllegalStateException("modelo sem entrada");
    }

    private static long millisSince(long nanos) {
        return (System.nanoTime() - nanos) / 1000000L;
    }
}
