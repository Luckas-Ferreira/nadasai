package com.nadasai.app;

import android.os.Bundle;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * Sem injecao de COOP/COEP aqui, e isso e MEDIDO, nao suposto.
 *
 * A tentativa obvia e trocar o `BridgeWebViewClient` e acrescentar
 * `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` a resposta de
 * `shouldInterceptRequest`, para devolver ao app o `SharedArrayBuffer` que o
 * `public/_headers` garante na web. Nao funciona: os cabecalhos CHEGAM ao
 * documento principal (verificado no logcat) e o WebView continua com
 * `crossOriginIsolated === false` e `SharedArrayBuffer === undefined`.
 *
 * Nao e limitacao do Capacitor. Servindo a mesma pagina de um servidor HTTP de
 * verdade, com os mesmos cabecalhos, sobre `http://localhost` (contexto seguro),
 * o resultado e o mesmo no WebView — e `crossOriginIsolated: true` com
 * `SharedArrayBuffer: function` no Chrome do MESMO aparelho. O WebView nao faz
 * isolamento de origem; o Chrome faz. Medido em WebView 145 / Android 17.
 *
 * A saida para isso e trabalho NATIVO, e nao mais cabecalho. O {@link TrimEngine}
 * e o {@link TranscodeEngine} sao o primeiro passo dela, para o video.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // ANTES do super: `registerPlugin` alimenta o `Bridge.Builder`, e o super
        // e quem constroi a ponte. Registrado depois, o plugin existe e o
        // JavaScript nunca o encontra.
        registerPlugin(VideoPlugin.class);

        super.onCreate(savedInstanceState);

        // DEPOIS do super, e aqui a ordem inversa e que e segura: o seletor de
        // arquivo so e acionado por toque, muito depois de a ponte existir. (O
        // WebViewClient nao teria essa folga — o documento principal e pedido
        // durante a construcao da ponte.)
        Bridge bridge = getBridge();
        bridge.getWebView().setWebChromeClient(new NadaSaiWebChromeClient(bridge));
    }
}
