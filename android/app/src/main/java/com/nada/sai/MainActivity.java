package com.nada.sai;

import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;

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
 * e o {@link TranscodeEngine} foram o primeiro passo dela, para o video; o
 * {@link MatteEngine} e o segundo, e responde a este paragrafo direto — o IS-Net
 * roda no ONNX Runtime nativo, com todos os nucleos, em vez da unica thread a
 * que o WebView condena o WASM.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // ANTES do super: `registerPlugin` alimenta o `Bridge.Builder`, e o super
        // e quem constroi a ponte. Registrado depois, o plugin existe e o
        // JavaScript nunca o encontra.
        registerPlugin(VideoPlugin.class);
        registerPlugin(MattePlugin.class);
        registerPlugin(ShellPlugin.class);

        super.onCreate(savedInstanceState);

        // DEPOIS do super, e aqui a ordem inversa e que e segura: o seletor de
        // arquivo so e acionado por toque, muito depois de a ponte existir. (O
        // WebViewClient nao teria essa folga — o documento principal e pedido
        // durante a construcao da ponte.)
        Bridge bridge = getBridge();
        bridge.getWebView().setWebChromeClient(new NadaSaiWebChromeClient(bridge));

        // As bordas da tela, e tambem depois do super pelo mesmo motivo: e a
        // WebView da ponte que recebe os recuos. Sem isto o app desenha por
        // baixo da barra de status e da de navegacao — veja SystemBars.
        SystemBars.attach(this, bridge.getWebView());

        // O botao VOLTAR, desviado enquanto a tela cheia esta aberta. Ver o
        // metodo abaixo.
        SystemBars.onBack(this, backToViewer(bridge));

        // O arquivo que veio do "Abrir com" ou da folha de compartilhar, quando
        // foi ELE que lancou o app. Copiado agora, mas NAO anunciado: nao ha
        // documento carregado a que dizer nada — quem pergunta e o arranque da
        // web, e a resposta e o `incomingFile` do ShellPlugin. Mesma corrida dos
        // recuos, mesma solucao.
        FileIntake.stash(this, getIntent());
    }

    /**
     * A INTENT QUE CHEGA COM O APP JA ABERTO.
     *
     * `launchMode="singleTask"` no manifesto e o que faz o segundo "Abrir com"
     * cair aqui em vez de criar uma segunda Activity — sem ele haveria duas
     * copias do app, cada uma com a propria sessao, e a de tras continuaria
     * segurando o arquivo anterior.
     *
     * O `setIntent` nao e enfeite: sem ele `getIntent()` continua devolvendo a
     * intent do LANCAMENTO pelo resto da vida da Activity, e qualquer codigo que
     * a consulte depois le o arquivo errado.
     *
     * Aqui, ao contrario do `onCreate`, ha documento carregado — entao o
     * empurrao funciona, e e o mesmo mecanismo do `nadasai:back`.
     */
    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);

        if (!FileIntake.stash(this, intent)) return;

        getBridge()
            .getWebView()
            .evaluateJavascript("window.dispatchEvent(new CustomEvent('nadasai:file'))", null);
    }

    /**
     * O BOTAO VOLTAR, DESVIADO ENQUANTO A TELA CHEIA ESTA ABERTA.
     *
     * Sem isto, voltar dentro do visualizador navegava a ROTA por baixo dele — o
     * visualizador continuava na tela, agora sobre uma ferramenta diferente da
     * que estava embaixo quando ele abriu. Num app de Android o botao voltar
     * fecha o que esta por cima, e e isso que ele passa a fazer.
     *
     * Quem liga e desliga o callback e {@link SystemBars#immersive}, pelo MESMO
     * sinal que esconde as barras: so o visualizador liga o imersivo, entao "as
     * barras estao escondidas" e "ha uma tela cheia aberta" sao a mesma frase, e
     * nao duas que podem discordar. Ele nasce DESLIGADO, e nesse estado o
     * dispatcher segue para o callback do Capacitor: em toda tela normal o botao
     * voltar continua fazendo exatamente o que sempre fez.
     *
     * `OnBackPressedDispatcher` e nao `onBackPressed()`: o segundo esta obsoleto
     * desde a API 33 e deixa de ser chamado no dia em que alguem ligar o
     * `enableOnBackInvokedCallback` no manifesto — um callback que simplesmente
     * para de rodar, sem erro nenhum.
     */
    private OnBackPressedCallback backToViewer(final Bridge bridge) {
        return new OnBackPressedCallback(false) {
            @Override
            public void handleOnBackPressed() {
                bridge
                    .getWebView()
                    .evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('nadasai:back'))",
                        null
                    );
            }
        };
    }
}
