package com.nada.sai.gl;

import android.graphics.SurfaceTexture;
import android.os.Handler;
import android.os.HandlerThread;
import android.view.Surface;

/**
 * A superficie onde o DECODIFICADOR entrega os quadros, ligada a uma textura
 * externa que o {@link TextureRender} sabe desenhar.
 *
 * Precisa ser construida com o contexto EGL da {@link InputSurface} JA CORRENTE:
 * a textura nasce nesse contexto, e uma textura de outro contexto desenha preto
 * sem lancar erro nenhum.
 *
 * ── A ESPERA E OBRIGATORIA, E O TIMEOUT E DE PROPOSITO ──────────────────────
 *
 * `releaseOutputBuffer(idx, true)` nao entrega o quadro na hora: ele e enfileirado
 * e a `SurfaceTexture` avisa depois, por callback. Chamar `updateTexImage()` antes
 * do aviso desenha o quadro ANTERIOR de novo — o video sai com quadros repetidos e
 * nenhum erro. Por isso `awaitNewImage()` bloqueia ate o aviso chegar.
 *
 * E bloqueia COM PRAZO. Sem prazo, um decodificador que engasgue trava a thread
 * para sempre, e o sintoma para quem usa e uma barra de progresso parada — o pior
 * modo de falha possivel numa operacao longa. Com prazo, vira excecao, que o
 * plugin traduz e o JavaScript resolve caindo no caminho web.
 */
public class OutputSurface implements SurfaceTexture.OnFrameAvailableListener {

    private static final int TIMEOUT_MS = 5000;

    private final TextureRender renderer;
    private final SurfaceTexture surfaceTexture;
    private final Surface surface;
    private final HandlerThread callbackThread;
    private final Object lock = new Object();

    private boolean available;

    public OutputSurface() {
        renderer = new TextureRender();
        renderer.setup();

        surfaceTexture = new SurfaceTexture(renderer.textureId());

        // O aviso de quadro pronto vai para uma THREAD PROPRIA, e isso evita um
        // travamento inteiro. Sem handler explicito, a `SurfaceTexture` entrega
        // o callback no Looper da thread que a criou — que e a mesma thread que
        // fica bloqueada em `awaitNewImage()`. O aviso nunca seria processado, o
        // prazo estouraria a cada quadro, e o sintoma para quem usa seria uma
        // barra de progresso parada.
        callbackThread = new HandlerThread("nadasai-frame-callback");
        callbackThread.start();
        surfaceTexture.setOnFrameAvailableListener(this, new Handler(callbackThread.getLooper()));

        surface = new Surface(surfaceTexture);
    }

    /** A superficie que vai no `decoder.configure(...)`. */
    public Surface surface() {
        return surface;
    }

    public void setCrop(float x, float y, float w, float h) {
        renderer.setCrop(x, y, w, h);
    }

    public void awaitNewImage() {
        synchronized (lock) {
            while (!available) {
                try {
                    lock.wait(TIMEOUT_MS);
                    if (!available) throw new RuntimeException("quadro do decodificador nao chegou em " + TIMEOUT_MS + "ms");
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException(e);
                }
            }
            available = false;
        }
        surfaceTexture.updateTexImage();
    }

    public void drawImage(int width, int height) {
        renderer.draw(surfaceTexture, width, height);
    }

    @Override
    public void onFrameAvailable(SurfaceTexture texture) {
        synchronized (lock) {
            available = true;
            lock.notifyAll();
        }
    }

    public void release() {
        surface.release();
        surfaceTexture.release();
        callbackThread.quitSafely();
    }
}
