package com.nada.sai;

import android.net.Uri;
import android.webkit.ValueCallback;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Espiona o resultado do seletor de arquivo para alimentar o {@link PickedFiles}.
 *
 * Nao muda o comportamento: envolve o callback, guarda os Uris e repassa o mesmo
 * valor para o Capacitor. Se esta classe sumir, o app continua funcionando — os
 * atalhos nativos e que deixam de encontrar a origem e caem no caminho web.
 */
public class NadaSaiWebChromeClient extends BridgeWebChromeClient {

    private final Bridge bridge;

    public NadaSaiWebChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        ValueCallback<Uri[]> spy = uris -> {
            if (uris != null) {
                for (Uri uri : uris) PickedFiles.remember(bridge.getContext(), uri);
            }
            callback.onReceiveValue(uris);
        };
        return super.onShowFileChooser(view, spy, params);
    }
}
