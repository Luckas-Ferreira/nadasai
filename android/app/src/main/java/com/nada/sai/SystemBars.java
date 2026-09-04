package com.nada.sai;

import android.app.Activity;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

/**
 * AS BARRAS DO SISTEMA, E A UNICA RAZAO PELA QUAL O APP PARECIA UM SITE.
 *
 * A partir do targetSdk 35 o Android IMPOE borda a borda: o
 * `setDecorFitsSystemWindows` passa a ser false por padrao e a janela ocupa a
 * tela inteira, com a WebView desenhando POR BAIXO da barra de status e da de
 * navegacao. Este projeto esta em targetSdk 36 e o layout do Capacitor
 * (`capacitor_bridge_layout_main.xml`) nao declara `fitsSystemWindows`, entao
 * nada recuava nada.
 *
 * E o lado web nao compensava porque nao TINHA como: `env(safe-area-inset-*)` so
 * devolve valor com `viewport-fit=cover`, e mesmo com ele a WebView deriva esses
 * valores do RECORTE DE TELA (display cutout), nao das barras do sistema — o
 * Chrome faz uma coisa, a WebView faz outra, e essa e a mesma classe de diferenca
 * ja registrada no {@link MainActivity} sobre o `crossOriginIsolated`.
 *
 * Resultado no aparelho: o cabecalho do app atras do relogio, a barra de
 * ferramentas do celular atras do risco da navegacao por gestos, e o
 * visualizador em tela cheia com o titulo e a fileira de destinos cortados nas
 * duas pontas. Ou seja, `fixed inset-0` SEMPRE cobriu a tela inteira; o que
 * faltava era o app saber onde ficam as bordas dela.
 *
 * ── O QUE ESTA CLASSE FAZ ───────────────────────────────────────────────────
 *
 * Le os recuos de verdade (`WindowInsetsCompat`) e os publica no CSS como
 * `--safe-top/right/bottom/left`, em pixels de CSS. Publicar em vez de recuar a
 * View e deliberado: recuando, as barras ganhariam uma faixa branca fixa e o
 * visualizador nunca poderia ir alem dela — que e exatamente o "igual a um app
 * nativo" que se quer aqui. Publicando, o conteudo continua desenhando de borda
 * a borda e cada superficie decide se respeita o recuo (a casca respeita) ou se
 * o ignora de proposito (o visualizador ignora).
 *
 * ── PUXA E EMPURRA, E ISSO NAO E REDUNDANCIA ────────────────────────────────
 *
 * Os recuos chegam antes de existir documento carregado, entao um
 * `evaluateJavascript` sozinho se perde na primeira vez — e e justamente a
 * primeira que decide se o app "abre torto". Por isso o ultimo valor fica
 * guardado e o {@link ShellPlugin} tem um metodo para o JavaScript PEDIR, no
 * arranque. O empurrao cobre rotacao, barra que aparece e some, e o modo
 * imersivo; o pedido cobre o arranque e todo recarregamento.
 */
final class SystemBars {

    /** Nada aqui e instanciavel: e a janela de UMA Activity. */
    private SystemBars() {}

    private static float safeTop = 0f;
    private static float safeRight = 0f;
    private static float safeBottom = 0f;
    private static float safeLeft = 0f;

    /** O callback do botao voltar. Ver {@link #onBack}. */
    private static OnBackPressedCallback back;

    /** Liga o borda a borda e passa a acompanhar os recuos. Chamado uma vez. */
    static void attach(final Activity activity, final WebView webView) {
        final Window window = activity.getWindow();

        // Explicito, e nao herdado do targetSdk: abaixo do 35 o padrao ainda e
        // `true`, e sem esta linha o app teria DOIS desenhos diferentes conforme
        // a versao do Android — o tipo de diferenca que so aparece no aparelho
        // de outra pessoa.
        WindowCompat.setDecorFitsSystemWindows(window, false);

        // O produto tem UM tema e ele e claro (veja `styles.css`), entao os
        // icones das barras precisam ser ESCUROS. Sem isto o relogio e os botoes
        // de navegacao saem brancos sobre o branco do app: invisiveis.
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, webView);
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(true);

        final float density = activity.getResources().getDisplayMetrics().density;

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            // As barras MAIS o recorte de tela: num aparelho com furo na tela em
            // modo paisagem o recorte e maior que a barra, e usar so as barras
            // deixaria o botao de fechar por baixo da camera.
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );

            safeTop = bars.top / density;
            safeRight = bars.right / density;
            safeBottom = bars.bottom / density;
            safeLeft = bars.left / density;

            publish(view);

            // CONSUMED nao: a WebView nao usa os recuos para nada, mas devolver
            // consumido cortaria qualquer View que o Capacitor venha a por ao
            // lado dela no CoordinatorLayout.
            return windowInsets;
        });

        // Um pedido explicito, porque a View so recebe recuo quando ela (ou a
        // hierarquia) e anexada — e neste ponto o `onCreate` pode ja ter passado.
        ViewCompat.requestApplyInsets(webView);
    }

    /**
     * Escreve os recuos no CSS do documento.
     *
     * A funcao e anonima e escreve DIRETO nas variaveis: assim ela nao depende de
     * nenhum codigo do lado web ter carregado ainda, o que e o caso na primeira
     * chamada. O evento no fim e para quem quiser reagir; ninguem precisa.
     */
    private static void publish(final View view) {
        if (!(view instanceof WebView)) return;

        final WebView webView = (WebView) view;
        final String js =
            "(function(t,r,b,l){try{var s=document.documentElement.style;"
                + "s.setProperty('--safe-top',t+'px');"
                + "s.setProperty('--safe-right',r+'px');"
                + "s.setProperty('--safe-bottom',b+'px');"
                + "s.setProperty('--safe-left',l+'px');"
                + "window.dispatchEvent(new CustomEvent('nadasai:insets'));}catch(e){}})("
                + safeTop + "," + safeRight + "," + safeBottom + "," + safeLeft + ")";

        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    static float top() {
        return safeTop;
    }

    static float right() {
        return safeRight;
    }

    static float bottom() {
        return safeBottom;
    }

    static float left() {
        return safeLeft;
    }

    /**
     * Esconde ou devolve as barras do sistema.
     *
     * E o que separa "uma pagina que ocupa a tela" de um visualizador de galeria.
     * O comportamento e o TRANSIENTE por deslize: as barras voltam sozinhas com
     * um arrasto da borda e somem de novo, que e o que todo app de fotos faz —
     * `BEHAVIOR_DEFAULT` faria o primeiro toque na imagem trazer as barras de
     * volta permanentemente, roubando o gesto de quem so queria alternar a
     * cromagem do visualizador.
     *
     * Ao esconder, os recuos viram zero e a publicacao acontece sozinha pelo
     * listener — entao a cromagem do visualizador encosta na borda de verdade,
     * como deve.
     */
    static void immersive(final Activity activity, final WebView webView, final boolean on) {
        activity.runOnUiThread(() -> {
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(activity.getWindow(), webView);

            if (on) {
                controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
                controller.hide(WindowInsetsCompat.Type.systemBars());
            } else {
                controller.show(WindowInsetsCompat.Type.systemBars());
            }

            // O MESMO sinal, para o segundo efeito. Nao e um estado paralelo: so
            // o visualizador liga o imersivo, entao "as barras estao escondidas"
            // e "ha uma tela cheia aberta" sao a mesma frase — e o botao voltar
            // precisa da segunda metade dela. Ligar o callback aqui dentro, e nao
            // num metodo a parte, e o que garante que as duas nunca discordem.
            if (back != null) back.setEnabled(on);
        });
    }

    /**
     * Guarda o callback do botao voltar, para {@link #immersive} liga-lo.
     *
     * O registro no dispatcher acontece aqui e nao no {@link MainActivity} so
     * para que o callback e o interruptor dele fiquem no mesmo arquivo: separados,
     * a proxima pessoa a mexer num nao teria por que olhar o outro.
     */
    static void onBack(final ComponentActivity activity, final OnBackPressedCallback callback) {
        back = callback;
        activity.getOnBackPressedDispatcher().addCallback(activity, callback);
    }
}
