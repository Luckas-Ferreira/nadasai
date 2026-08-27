package com.nadasai.app;

import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A fiacao entre o JavaScript e o {@link MatteEngine}: base64 para bytes, bytes
 * para base64, e nada mais. A inferencia vive no motor, que por isso pode ser
 * exercitado sem Capacitor nenhum — mesma divisao do {@link VideoPlugin}.
 *
 * Os dois metodos correm FORA da thread principal. Montar a sessao le 44 MB do
 * APK e a inferencia leva segundos: na thread principal isso e um ANR, e nao um
 * app lento.
 */
@CapacitorPlugin(name = "NadaSaiMatte")
public class MattePlugin extends Plugin {

    private static final String TAG = "NadaSaiMatte";

    /**
     * Constroi a sessao antes de existir foto, chamado pelo prefetch.
     *
     * Resolve com `ready: false` em vez de rejeitar quando falha, porque quem
     * chama e oportunista: um aquecimento que nao deu certo nao pode virar erro
     * na tela de quem nem pediu recorte ainda. O caminho de verdade tenta de novo
     * e, se tambem falhar, o JS cai no WASM.
     */
    @PluginMethod
    public void warm(PluginCall call) {
        new Thread(() -> {
            JSObject json = new JSObject();
            try {
                long began = System.nanoTime();
                MatteEngine.warm(getContext());
                json.put("ready", true);
                json.put("threads", MatteEngine.threads());
                json.put("elapsedMs", (System.nanoTime() - began) / 1000000L);
            } catch (Throwable e) {
                // Throwable, e nao Exception: 44 MB de pesos mais o grafo montado
                // podem esbarrar no heap, e um OutOfMemoryError aqui tem que
                // devolver o trabalho ao WASM em vez de derrubar o app.
                Log.w(TAG, "aquecimento falhou, o WASM assume", e);
                json.put("ready", false);
            }
            call.resolve(json);
        }, "nadasai-matte-warm").start();
    }

    /**
     * Recebe o quadrado de 1024x1024 em PNG e devolve a mascara em 8 bits.
     *
     * O tamanho volta junto do resultado para que o JS confira em vez de supor —
     * uma mascara com a aresta errada e a que produz um recorte deslocado, que
     * parece problema do modelo.
     */
    @PluginMethod
    public void matte(PluginCall call) {
        String image = call.getString("image");
        if (image == null) {
            call.reject("falta image", "BAD_REQUEST");
            return;
        }

        new Thread(() -> {
            try {
                long began = System.nanoTime();
                byte[] png = Base64.decode(image, Base64.DEFAULT);
                byte[] mask = MatteEngine.matte(getContext(), png);
                long millis = (System.nanoTime() - began) / 1000000L;

                Log.i(TAG, "mascara em " + millis + "ms, " + MatteEngine.threads() + " threads");

                JSObject json = new JSObject();
                json.put("mask", Base64.encodeToString(mask, Base64.NO_WRAP));
                json.put("size", (int) Math.round(Math.sqrt(mask.length)));
                json.put("threads", MatteEngine.threads());
                json.put("elapsedMs", millis);
                call.resolve(json);
            } catch (Throwable e) {
                Log.e(TAG, "inferencia falhou, o WASM assume", e);
                call.reject(String.valueOf(e.getMessage()), "FAILED");
            }
        }, "nadasai-matte").start();
    }
}
