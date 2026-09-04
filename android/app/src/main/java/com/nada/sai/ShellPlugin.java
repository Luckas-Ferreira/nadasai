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

    /**
     * O arquivo que o sistema entregou, se houver um esperando.
     *
     * Devolve METADADO, nunca os bytes: um video de centenas de MB atravessando
     * a ponte como base64 e memoria que a aba nao tem, e a ponte serializa em
     * JSON. O `path` aponta para a copia no cache, e quem a le e a propria
     * WebView, pelo servidor local do Capacitor — o mesmo caminho que ja serve
     * todos os assets, sem socket nenhum (ver o comentario das permissoes no
     * AndroidManifest).
     *
     * `present: false` e a resposta normal: quase todo lancamento do app nao tem
     * arquivo nenhum, e a web pergunta em TODO arranque porque a intent que
     * LANCA o app chega antes de existir documento para avisar. E a mesma
     * corrida que o `insets` acima resolve do mesmo jeito.
     */
    @PluginMethod
    public void incomingFile(PluginCall call) {
        final FileIntake.Pending pending = FileIntake.peek();

        JSObject json = new JSObject();
        if (pending == null) {
            json.put("present", false);
            call.resolve(json);
            return;
        }

        json.put("present", true);
        json.put("path", pending.path);
        json.put("name", pending.name);
        json.put("mimeType", pending.mimeType);
        json.put("size", pending.size);
        call.resolve(json);
    }

    /**
     * Apaga a copia, e a web chama isto DEPOIS de ter os bytes na mao.
     *
     * Separado do `incomingFile` de proposito: apagar na leitura do metadado
     * derrubaria o arquivo antes de a WebView o buscar. E ele PRECISA ser
     * apagado — num produto cujo argumento e que nada fica guardado, o arquivo
     * de outra pessoa esquecido no cache seria vazamento local, mas real. Mesma
     * regra que faz `share-target.ts` apagar a entrada do Cache Storage ao ler.
     */
    @PluginMethod
    public void releaseIncomingFile(PluginCall call) {
        FileIntake.release();
        call.resolve();
    }
}
