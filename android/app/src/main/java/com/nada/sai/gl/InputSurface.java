package com.nada.sai.gl;

import android.opengl.EGL14;
import android.opengl.EGLConfig;
import android.opengl.EGLContext;
import android.opengl.EGLDisplay;
import android.opengl.EGLExt;
import android.opengl.EGLSurface;
import android.view.Surface;

/**
 * O contexto EGL montado SOBRE a superficie de entrada do codificador.
 *
 * Tudo que for desenhado com este contexto corrente vira quadro de entrada do
 * MediaCodec, sem passar pela memoria do processo. E a metade de escrita do
 * caminho com OpenGL; a de leitura e a {@link OutputSurface}.
 *
 * ── POR QUE UM CONTEXTO SO PARA AS DUAS PONTAS ──────────────────────────────
 *
 * A textura externa que recebe os quadros do decodificador precisa ser criada
 * NESTE contexto. Dois contextos separados nao compartilham textura sem
 * `share_context`, e a falha nao aparece como erro: desenha preto. Por isso a
 * ordem e sempre a mesma — criar este, torna-lo corrente, e so entao construir a
 * {@link OutputSurface}.
 *
 * ── EGL_RECORDABLE_ANDROID ──────────────────────────────────────────────────
 *
 * Sem esse atributo, a superficie pode ser escolhida com um formato que o
 * codificador nao aceita, e o resultado sao quadros com cor errada ou vazios.
 * E especifico do Android e nao esta no EGL14, por isso a constante crua.
 */
public class InputSurface {

    private static final int EGL_RECORDABLE_ANDROID = 0x3142;

    private EGLDisplay display = EGL14.EGL_NO_DISPLAY;
    private EGLContext context = EGL14.EGL_NO_CONTEXT;
    private EGLSurface surface = EGL14.EGL_NO_SURFACE;

    private final Surface target;

    public InputSurface(Surface target) {
        if (target == null) throw new NullPointerException("superficie do codificador nula");
        this.target = target;
        setup();
    }

    private void setup() {
        display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);
        if (display == EGL14.EGL_NO_DISPLAY) throw new RuntimeException("eglGetDisplay falhou");

        int[] version = new int[2];
        if (!EGL14.eglInitialize(display, version, 0, version, 1)) {
            throw new RuntimeException("eglInitialize falhou");
        }

        int[] attributes = {
            EGL14.EGL_RED_SIZE, 8,
            EGL14.EGL_GREEN_SIZE, 8,
            EGL14.EGL_BLUE_SIZE, 8,
            EGL14.EGL_ALPHA_SIZE, 8,
            EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
            EGL_RECORDABLE_ANDROID, 1,
            EGL14.EGL_NONE
        };
        EGLConfig[] configs = new EGLConfig[1];
        int[] count = new int[1];
        if (!EGL14.eglChooseConfig(display, attributes, 0, configs, 0, configs.length, count, 0) || count[0] < 1) {
            throw new RuntimeException("nenhuma configuracao EGL para gravacao");
        }

        int[] contextAttributes = { EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE };
        context = EGL14.eglCreateContext(display, configs[0], EGL14.EGL_NO_CONTEXT, contextAttributes, 0);
        if (context == null || context == EGL14.EGL_NO_CONTEXT) throw new RuntimeException("eglCreateContext falhou");

        surface = EGL14.eglCreateWindowSurface(display, configs[0], target, new int[] { EGL14.EGL_NONE }, 0);
        if (surface == null || surface == EGL14.EGL_NO_SURFACE) throw new RuntimeException("eglCreateWindowSurface falhou");
    }

    public void makeCurrent() {
        if (!EGL14.eglMakeCurrent(display, surface, surface, context)) {
            throw new RuntimeException("eglMakeCurrent falhou");
        }
    }

    /**
     * O tempo do quadro, em NANOSSEGUNDOS, e ele precisa ser marcado ANTES do
     * swap: e este valor que vira o `presentationTimeUs` da amostra codificada.
     * Sem marcar, o MediaCodec usa o relogio do sistema e o video sai com os
     * tempos do momento em que foi processado, nao os do conteudo.
     */
    public void setPresentationTime(long nanoseconds) {
        EGLExt.eglPresentationTimeANDROID(display, surface, nanoseconds);
    }

    /** Entrega o quadro ao codificador. */
    public boolean swapBuffers() {
        return EGL14.eglSwapBuffers(display, surface);
    }

    public void release() {
        if (display != EGL14.EGL_NO_DISPLAY) {
            EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT);
            EGL14.eglDestroySurface(display, surface);
            EGL14.eglDestroyContext(display, context);
            EGL14.eglReleaseThread();
            EGL14.eglTerminate(display);
        }
        display = EGL14.EGL_NO_DISPLAY;
        context = EGL14.EGL_NO_CONTEXT;
        surface = EGL14.EGL_NO_SURFACE;
    }
}
