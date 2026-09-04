package com.nada.sai;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A CASCA DO APARELHO, exposta ao JavaScript: onde ficam as bordas da tela e
 * quem manda nas barras do sistema.
 *
 * A fiacao esta aqui e o trabalho esta em {@link SystemBars}, mesma divisao do
 * {@link MattePlugin} e do {@link VideoPlugin}. Sao dois metodos e nada mais.
 *
 * `insets` existe por causa de uma corrida que nao da para evitar do lado
 * nativo: os recuos sao entregues a View muito antes de existir documento, entao
 * o empurrao do {@link SystemBars} se perde na primeira vez. Quem arranca PEDE.
 *
 * `immersive` e o que faz o visualizador ser um visualizador de verdade. Ele nao
 * guarda estado nenhum: quem sabe se a tela cheia esta aberta e o componente
 * Angular, e duplicar isso aqui daria duas fontes para a mesma verdade — a
 * classica que deixa a barra escondida depois que a tela fechou.
 */
@CapacitorPlugin(name = "NadaSaiShell")
public class ShellPlugin extends Plugin {

    /** Os recuos atuais, em pixels de CSS. Lido no arranque e a cada recarga. */
    @PluginMethod
    public void insets(PluginCall call) {
        JSObject json = new JSObject();
        json.put("top", SystemBars.top());
        json.put("right", SystemBars.right());
        json.put("bottom", SystemBars.bottom());
        json.put("left", SystemBars.left());
        call.resolve(json);
    }

    /**
     * Esconde (ou devolve) a barra de status e a de navegacao.
     *
     * `getBoolean` com padrao `false` e a degradacao certa: uma chamada
     * malformada DEVOLVE as barras, nunca deixa o aparelho preso sem elas.
     */
    @PluginMethod
    public void immersive(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        SystemBars.immersive(getActivity(), getBridge().getWebView(), on);
        call.resolve();
    }
}
