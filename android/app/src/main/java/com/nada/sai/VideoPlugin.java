package com.nada.sai;

import android.net.Uri;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A fiacao entre o JavaScript e os dois motores de video: traduz JSON, resolve a
 * origem, escolhe o motor, e nada mais. A leitura e a escrita de midia vivem em
 * {@link TrimEngine} e {@link TranscodeEngine}, que por isso podem ser
 * exercitados sem Capacitor nenhum — foi assim que os dois foram medidos.
 *
 * ── OS DOIS MOTORES, E QUEM ESCOLHE ─────────────────────────────────────────
 *
 * Copiar amostra e sem perda e instantaneo, mas so comeca num quadro-chave e
 * nunca muda o tamanho do quadro. Recodificar e exato ao quadro e faz recorte e
 * resolucao, custando tempo de codificacao. Nenhum dos dois e melhor:
 *
 *     mexe no TAMANHO do quadro                             ->  recodificacao
 *     quadro-chave a menos de `toleranceSeconds` do pedido  ->  copia
 *     qualquer outro caso                                   ->  recodificacao
 *
 * O caso da copia se descobre com um seek, antes de qualquer trabalho — copiar o
 * arquivo inteiro para so entao descobrir que nao servia seria pagar duas vezes.
 *
 * O VALOR da tolerancia vem do JavaScript de proposito. Ele e politica de
 * produto — quanto de deslocamento deixa de ser perceptivel — e mora em
 * `native-video.ts`, num lugar so. Aqui fica o MECANISMO. O `mode` devolvido diz
 * qual caminho correu, para que a medicao nunca dependa de adivinhacao.
 *
 * ── O QUE ATRAVESSA A PONTE, E POR QUE NAO SAO OS BYTES ─────────────────────
 *
 * A ponte do Capacitor e JSON. Um video de 500 MB viraria ~666 MB de base64
 * atravessando a fronteira ANTES de o trabalho comecar — mais lento que o
 * caminho web que este plugin existe para substituir. Entao o que atravessa e o
 * NOME, e o {@link PickedFiles} reencontra o `content://` que o
 * {@link NadaSaiWebChromeClient} viu passar pelo seletor de arquivo. O resultado
 * volta pelo mesmo principio: um CAMINHO, que o JS converte em URL do servidor
 * local — sem socket, que e o que permite isto funcionar num app sem permissao
 * de rede.
 *
 * ── E TUDO RODA FORA DA THREAD PRINCIPAL ────────────────────────────────────
 *
 * Recodificar um video leva segundos ou minutos. Na thread principal isso e um
 * ANR — o dialogo de "o app nao esta respondendo" — e nao um app lento.
 */
@CapacitorPlugin(name = "NadaSaiVideo")
public class VideoPlugin extends Plugin {

    private static final String TAG = "NadaSaiVideo";

    /** Sem valor vindo do JS, so a copia exata serve. */
    private static final double DEFAULT_TOLERANCE_SECONDS = 0.0;

    @PluginMethod
    public void process(PluginCall call) {
        String name = call.getString("name");
        Double size = call.getDouble("size");
        Double startSeconds = call.getDouble("startSeconds");
        Double endSeconds = call.getDouble("endSeconds");

        if (name == null || startSeconds == null || endSeconds == null) {
            call.reject("faltam name/startSeconds/endSeconds", "BAD_REQUEST");
            return;
        }

        Uri source = PickedFiles.find(name, size == null ? -1L : size.longValue());
        if (source == null) {
            // Nao e erro: o arquivo pode ter vindo da cadeia, de um gravador, ou
            // de qualquer caminho que nao passou pelo seletor de arquivo.
            call.reject("origem nao encontrada para " + name, "NO_SOURCE");
            return;
        }

        new Thread(() -> run(call, source), "nadasai-video").start();
    }

    private void run(PluginCall call, Uri source) {
        try {
            long startUs = us(call.getDouble("startSeconds"));
            long endUs = us(call.getDouble("endSeconds"));

            Double tolerance = call.getDouble("toleranceSeconds");
            long toleranceUs = us(tolerance == null ? DEFAULT_TOLERANCE_SECONDS : tolerance);

            Double rectX = call.getDouble("rectX");
            Double rectY = call.getDouble("rectY");
            Double rectW = call.getDouble("rectW");
            Double rectH = call.getDouble("rectH");
            boolean hasRect = rectX != null && rectY != null && rectW != null && rectH != null;

            int maxHeight = intOr(call.getDouble("maxHeight"), 0);
            int bitrate = intOr(call.getDouble("bitrate"), 0);
            boolean geometry = hasRect || maxHeight > 0 || bitrate > 0;

            String mode;
            long began = System.nanoTime();
            TrimEngine.Result result;

            if (geometry) {
                TranscodeEngine.Spec spec = new TranscodeEngine.Spec(
                    hasRect,
                    hasRect ? rectX.floatValue() : 0f,
                    hasRect ? rectY.floatValue() : 0f,
                    hasRect ? rectW.floatValue() : 1f,
                    hasRect ? rectH.floatValue() : 1f,
                    maxHeight,
                    bitrate
                );
                result = TranscodeEngine.transcode(getContext(), source, startUs, endUs, spec);
                mode = "transcode";
            } else {
                long keyframeUs = TrimEngine.keyframeAtOrBefore(getContext(), source, startUs);
                boolean lossless = keyframeUs >= 0 && (startUs - keyframeUs) <= toleranceUs;
                result = lossless
                    ? TrimEngine.copy(getContext(), source, startUs, endUs)
                    : TranscodeEngine.transcode(getContext(), source, startUs, endUs);
                mode = lossless ? "copy" : "transcode";
            }

            long millis = (System.nanoTime() - began) / 1000000L;
            Log.i(TAG, mode + " em " + millis + "ms -> " + result.width + "x" + result.height);

            JSObject json = new JSObject();
            json.put("path", result.file.getAbsolutePath());
            json.put("bytes", result.file.length());
            json.put("width", result.width);
            json.put("height", result.height);
            json.put("hasAudio", result.hasAudio);
            json.put("requestedStartSeconds", result.requestedStartUs / 1000000d);
            json.put("actualStartSeconds", result.actualStartUs / 1000000d);
            json.put("durationSeconds", result.durationUs / 1000000d);
            json.put("mode", mode);
            json.put("elapsedMs", millis);
            call.resolve(json);
        } catch (UnsupportedOperationException e) {
            Log.i(TAG, "recusado, cai no caminho web: " + e.getMessage());
            call.reject(String.valueOf(e.getMessage()), "UNSUPPORTED");
        } catch (Exception e) {
            Log.e(TAG, "processamento falhou", e);
            call.reject(String.valueOf(e.getMessage()), "FAILED");
        }
    }

    private static int intOr(Double value, int fallback) {
        return value == null ? fallback : (int) Math.round(value);
    }

    private static long us(Double seconds) {
        return seconds == null ? 0L : (long) (seconds * 1000000d);
    }
}
