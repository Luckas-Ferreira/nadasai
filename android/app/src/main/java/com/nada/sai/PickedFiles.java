package com.nada.sai;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Log;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Lembra os `content://` que a pessoa escolheu no seletor de arquivo, para que
 * o lado nativo consiga achar de novo o arquivo que o WebView entregou ao JS
 * como um `File`.
 *
 * POR QUE ISSO PRECISA EXISTIR. Um `File` do JavaScript nao carrega caminho
 * nenhum — por design, e com razao. Mas o MediaExtractor precisa da origem para
 * ler as amostras, e mandar os bytes do video pela ponte do Capacitor esta fora
 * de questao: a ponte e JSON, e um video de 500 MB viraria ~666 MB de base64
 * atravessando a fronteira para so entao comecar o trabalho. Seria mais lento
 * que o caminho web que este plugin existe para substituir.
 *
 * O gancho e o `onShowFileChooser`: quando o WebView abre o seletor, quem
 * responde com o `Uri[]` e o WebChromeClient — nos. O JS recebe o `File` e nos
 * guardamos o `Uri` do MESMO arquivo, ligados por nome e tamanho. Nada muda na
 * interface: o `app-dropzone` continua sendo um `<input type=file>`.
 *
 * O casamento por (nome, tamanho) e HEURISTICA, e e por isso que o lado JS trata
 * "nao achei" como caminho normal e nao como erro: sem correspondencia, a
 * ferramenta cai no caminho web que ja existe e entrega o mesmo resultado, so
 * que devagar. O pior caso e o comportamento de hoje.
 */
final class PickedFiles {

    private static final String TAG = "NadaSaiPicked";

    /** Poucas, e as mais recentes: isto e um atalho de sessao, nao um cache. */
    private static final int MAX = 8;

    private static final class Entry {
        final Uri uri;
        final String name;
        final long size;

        Entry(Uri uri, String name, long size) {
            this.uri = uri;
            this.name = name;
            this.size = size;
        }
    }

    private static final Deque<Entry> RECENT = new ArrayDeque<>();

    private PickedFiles() {}

    static synchronized void remember(Context context, Uri uri) {
        if (context == null || uri == null) return;

        String name = null;
        long size = -1;

        try (Cursor cursor = context.getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameCol = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeCol = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (nameCol >= 0) name = cursor.getString(nameCol);
                if (sizeCol >= 0 && !cursor.isNull(sizeCol)) size = cursor.getLong(sizeCol);
            }
        } catch (Exception e) {
            // Um provedor que nao responde as colunas padrao nao e falha: sem
            // nome, este arquivo simplesmente nao tera atalho nativo.
            Log.w(TAG, "nao consegui ler nome/tamanho de " + uri, e);
        }

        if (name == null) return;

        RECENT.addFirst(new Entry(uri, name, size));
        while (RECENT.size() > MAX) RECENT.removeLast();
    }

    /**
     * O Uri do arquivo, ou null. Tamanho negativo significa "nao sei", e ai o
     * nome decide sozinho.
     */
    static synchronized Uri find(String name, long size) {
        if (name == null) return null;

        // Nome E tamanho primeiro: e o que distingue duas copias do mesmo nome.
        for (Entry e : RECENT) {
            if (name.equals(e.name) && size >= 0 && e.size == size) return e.uri;
        }
        for (Entry e : RECENT) {
            if (name.equals(e.name)) return e.uri;
        }
        return null;
    }
}
