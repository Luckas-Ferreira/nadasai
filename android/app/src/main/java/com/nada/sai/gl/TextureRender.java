package com.nada.sai.gl;

import android.opengl.GLES11Ext;
import android.opengl.GLES20;
import android.opengl.Matrix;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

/**
 * Desenha o quadro do decodificador na superficie do codificador — e e AQUI que
 * o recorte e a mudanca de resolucao acontecem.
 *
 * O quadro chega numa textura EXTERNA (`GL_TEXTURE_EXTERNAL_OES`), que e o
 * formato que o decodificador de video entrega. Ela nao e uma textura comum: o
 * shader precisa da extensao `GL_OES_EGL_image_external`, e o layout real dos
 * pixels (YUV, alinhamento, orientacao) fica escondido atras da matriz de
 * transformacao que a `SurfaceTexture` fornece.
 *
 * ── COMO O RECORTE E FEITO ──────────────────────────────────────────────────
 *
 * NAO se recorta desenhando menor. Recorta-se escolhendo QUE PARTE da textura o
 * quadro inteiro vai mostrar: as coordenadas de textura deixam de ser 0..1 e
 * passam a ser o retangulo pedido. O `glViewport` entao tem o tamanho da SAIDA,
 * e o hardware faz recorte e redimensionamento na mesma passada, de graca.
 *
 * ── O EIXO Y E INVERTIDO, E ESQUECER ISSO NAO DA ERRO ───────────────────────
 *
 * O retangulo vem em coordenadas de IMAGEM, com o Y crescendo para baixo, que e
 * como todo overlay de interface fala. A textura tem o Y crescendo para cima.
 * Sem inverter, um recorte do topo entrega o rodape — e o resultado e um video
 * perfeitamente valido, com o pedaco errado dentro. Nao ha excecao nem log que
 * denuncie isso; so olhando.
 */
public class TextureRender {

    private static final int FLOAT_BYTES = 4;

    private static final String VERTEX_SHADER =
        "uniform mat4 uSTMatrix;\n" +
        "attribute vec4 aPosition;\n" +
        "attribute vec4 aTextureCoord;\n" +
        "varying vec2 vTextureCoord;\n" +
        "void main() {\n" +
        "  gl_Position = aPosition;\n" +
        "  vTextureCoord = (uSTMatrix * aTextureCoord).xy;\n" +
        "}\n";

    private static final String FRAGMENT_SHADER =
        "#extension GL_OES_EGL_image_external : require\n" +
        "precision mediump float;\n" +
        "varying vec2 vTextureCoord;\n" +
        "uniform samplerExternalOES sTexture;\n" +
        "void main() {\n" +
        "  gl_FragColor = texture2D(sTexture, vTextureCoord);\n" +
        "}\n";

    /** Quad de tela cheia: x, y, z, u, v. Os u/v sao reescritos pelo recorte. */
    private final float[] vertices = {
        -1.0f, -1.0f, 0.0f, 0.0f, 0.0f,
         1.0f, -1.0f, 0.0f, 1.0f, 0.0f,
        -1.0f,  1.0f, 0.0f, 0.0f, 1.0f,
         1.0f,  1.0f, 0.0f, 1.0f, 1.0f,
    };

    private final FloatBuffer buffer;
    private final float[] stMatrix = new float[16];

    private int program;
    private int textureId = -1;
    private int uSTMatrix;
    private int aPosition;
    private int aTextureCoord;

    public TextureRender() {
        buffer = ByteBuffer.allocateDirect(vertices.length * FLOAT_BYTES)
            .order(ByteOrder.nativeOrder())
            .asFloatBuffer();
        buffer.put(vertices).position(0);
        Matrix.setIdentityM(stMatrix, 0);
    }

    public int textureId() {
        return textureId;
    }

    public void setup() {
        program = buildProgram();
        aPosition = GLES20.glGetAttribLocation(program, "aPosition");
        aTextureCoord = GLES20.glGetAttribLocation(program, "aTextureCoord");
        uSTMatrix = GLES20.glGetUniformLocation(program, "uSTMatrix");

        int[] textures = new int[1];
        GLES20.glGenTextures(1, textures, 0);
        textureId = textures[0];

        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId);
        GLES20.glTexParameterf(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameterf(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
        // CLAMP_TO_EDGE, e nao repeat: com repeat, o filtro linear na borda do
        // recorte busca pixel do lado OPOSTO da imagem e desenha uma linha de
        // cor errada em volta do quadro inteiro.
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
    }

    /**
     * A parte da imagem que vai preencher o quadro de saida, em FRACAO e em
     * coordenadas de imagem (Y para baixo) — as mesmas que `CropRect` usa do
     * lado do TypeScript.
     */
    public void setCrop(float x, float y, float w, float h) {
        float left = x;
        float right = x + w;
        // A inversao do Y: o topo do recorte e a coordenada MAIOR na textura.
        float top = 1.0f - y;
        float bottom = 1.0f - (y + h);

        vertices[3] = left;   vertices[4] = bottom;
        vertices[8] = right;  vertices[9] = bottom;
        vertices[13] = left;  vertices[14] = top;
        vertices[18] = right; vertices[19] = top;

        buffer.put(vertices).position(0);
    }

    public void draw(android.graphics.SurfaceTexture surfaceTexture, int width, int height) {
        surfaceTexture.getTransformMatrix(stMatrix);

        GLES20.glViewport(0, 0, width, height);
        GLES20.glClearColor(0f, 0f, 0f, 1f);
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);

        GLES20.glUseProgram(program);
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId);

        buffer.position(0);
        GLES20.glVertexAttribPointer(aPosition, 3, GLES20.GL_FLOAT, false, 5 * FLOAT_BYTES, buffer);
        GLES20.glEnableVertexAttribArray(aPosition);

        buffer.position(3);
        GLES20.glVertexAttribPointer(aTextureCoord, 2, GLES20.GL_FLOAT, false, 5 * FLOAT_BYTES, buffer);
        GLES20.glEnableVertexAttribArray(aTextureCoord);

        GLES20.glUniformMatrix4fv(uSTMatrix, 1, false, stMatrix, 0);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);

        GLES20.glDisableVertexAttribArray(aPosition);
        GLES20.glDisableVertexAttribArray(aTextureCoord);
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, 0);
    }

    private int buildProgram() {
        int vertex = compile(GLES20.GL_VERTEX_SHADER, VERTEX_SHADER);
        int fragment = compile(GLES20.GL_FRAGMENT_SHADER, FRAGMENT_SHADER);

        int id = GLES20.glCreateProgram();
        if (id == 0) throw new RuntimeException("glCreateProgram falhou");
        GLES20.glAttachShader(id, vertex);
        GLES20.glAttachShader(id, fragment);
        GLES20.glLinkProgram(id);

        int[] status = new int[1];
        GLES20.glGetProgramiv(id, GLES20.GL_LINK_STATUS, status, 0);
        if (status[0] != GLES20.GL_TRUE) {
            String log = GLES20.glGetProgramInfoLog(id);
            GLES20.glDeleteProgram(id);
            throw new RuntimeException("link do programa falhou: " + log);
        }

        GLES20.glDeleteShader(vertex);
        GLES20.glDeleteShader(fragment);
        return id;
    }

    private int compile(int type, String source) {
        int shader = GLES20.glCreateShader(type);
        GLES20.glShaderSource(shader, source);
        GLES20.glCompileShader(shader);

        int[] status = new int[1];
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, status, 0);
        if (status[0] == 0) {
            String log = GLES20.glGetShaderInfoLog(shader);
            GLES20.glDeleteShader(shader);
            throw new RuntimeException("compilacao do shader falhou: " + log);
        }
        return shader;
    }
}
