package com.nadasai.app;

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
 * Consequencia, e ela esta contida: `BackgroundRemovalService` ja le
 * `crossOriginIsolated` e cai para `numThreads = 1` sozinho. A remocao de fundo
 * roda single-threaded no app. Nenhuma outra ferramenta depende disso — os cores
 * do Tesseract usados aqui sao os `-lstm` sem threads, e o pdf.js nao usa
 * SharedArrayBuffer.
 *
 * A saida para isso e trabalho NATIVO, e nao mais cabecalho.
 */
public class MainActivity extends BridgeActivity {}
