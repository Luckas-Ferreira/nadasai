package com.nada.sai;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.core.content.IntentCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * O ARQUIVO QUE O SISTEMA ENTREGA, guardado ate a camada web conseguir le-lo.
 *
 * O manifesto declara "Abrir com" (ACTION_VIEW) e a folha de compartilhar
 * (ACTION_SEND); esta classe e o que transforma a intent num arquivo que o
 * JavaScript consegue abrir.
 *
 * ── POR QUE COPIAR, E NAO GUARDAR O Uri ─────────────────────────────────────
 *
 * A permissao de leitura de um `content://` nao e do app: e da INTENT, e vale
 * enquanto a tarefa que a recebeu viver. Guardar o Uri para ler "quando o
 * JavaScript pedir" e uma aposta em duas coisas que nao se controla — o app nao
 * ser morto e recriado no meio, e o app que enviou nao revogar a concessao. As
 * duas falham em silencio e o que aparece na tela e "nao consegui abrir", sem
 * dizer por que. Copiar NA HORA em que a intent chega e o unico momento em que
 * a leitura e garantida.
 *
 * O custo e uma duplicata em disco (um video pode ter centenas de MB), e por
 * isso ela e apagada assim que a web termina de ler — {@link #release} — e a
 * pasta e limpa antes de cada nova chegada. Num produto cujo argumento e que
 * nada fica guardado, um arquivo de outra pessoa esquecido no cache seria a pior
 * forma possivel de vazamento: local, mas real. E a mesma razao pela qual
 * `share-target.ts` APAGA a entrada do Cache Storage ao ler.
 *
 * ── O NOME NAO VIRA CAMINHO ────────────────────────────────────────────────
 *
 * O nome de exibicao vem de OUTRO aplicativo, entao ele e dado, nunca caminho:
 * o arquivo em disco recebe um nome fixo nosso e o nome de verdade viaja como
 * METADADO, para a web reconstruir o `File` com ele. Concatenar o nome recebido
 * no caminho e como se escreve um path traversal por acidente.
 */
final class FileIntake {

    private FileIntake() {}

    /** A pasta do cache onde a copia vive, e nada mais mora. */
    private static final String DIR = "incoming";

    /** O nome em disco. Fixo de proposito: ver o cabecalho. */
    private static final String BLOB = "payload";

    /** O que a web precisa saber. `path` e o caminho da copia, nao o do original. */
    static final class Pending {
        final String path;
        final String name;
        final String mimeType;
        final long size;

        Pending(String path, String name, String mimeType, long size) {
            this.path = path;
            this.name = name;
            this.mimeType = mimeType;
            this.size = size;
        }
    }

    private static Pending pending;

    /**
     * Le o Uri da intent, se houver um.
     *
     * ACTION_VIEW o poe nos DADOS da intent; ACTION_SEND o poe em EXTRA_STREAM.
     * Sao dois lugares diferentes para a mesma coisa, e e por isso que esta
     * funcao existe em vez de duas linhas no chamador.
     *
     * `IntentCompat` e nao `getParcelableExtra(String)`: o segundo esta obsoleto
     * desde a API 33 e a versao tipada so existe de la para ca — a mesma
     * armadilha do `onBackPressed()` registrada no {@link MainActivity}.
     */
    static Uri uriOf(final Intent intent) {
        if (intent == null) return null;

        final String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action)) return intent.getData();
        if (Intent.ACTION_SEND.equals(action)) {
            return IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri.class);
        }
        return null;
    }

    /**
     * Copia o conteudo para o cache e passa a ser o arquivo pendente.
     *
     * Devolve `false` quando nao ha nada a fazer ou quando a leitura falha, e o
     * app entao abre normalmente — a pessoa cai na tela inicial em vez de numa
     * mensagem de erro sobre uma intent que ela nao sabe que existe.
     */
    static boolean stash(final Context context, final Intent intent) {
        final Uri uri = uriOf(intent);
        if (uri == null) return false;

        final ContentResolver resolver = context.getContentResolver();
        final File dir = new File(context.getCacheDir(), DIR);
        final File blob = new File(dir, BLOB);

        // Limpa ANTES de escrever: duas chegadas seguidas nao podem deixar a
        // primeira para tras, e uma copia interrompida nao pode ser lida como
        // se estivesse inteira.
        release();
        if (!dir.exists() && !dir.mkdirs()) return false;

        long copied = 0;
        try (InputStream in = resolver.openInputStream(uri);
             OutputStream out = new FileOutputStream(blob)) {
            if (in == null) return false;

            final byte[] buffer = new byte[64 * 1024];
            int read;
            // `read` devolve 0 para um pedido de tamanho zero e -1 no fim; aqui o
            // pedido nunca e zero, entao -1 basta. E a mesma familia de laco que
            // o MatteEngine documenta, onde o buffer cheio TAMBEM tinha de parar.
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
                copied += read;
            }
        } catch (IOException | SecurityException error) {
            // SecurityException e o caso real, nao o teorico: e o que se recebe
            // quando a concessao da intent ja nao vale.
            blob.delete();
            return false;
        }

        pending = new Pending(blob.getAbsolutePath(), displayName(resolver, uri), type(resolver, intent, uri), copied);
        return true;
    }

    /** O metadado do arquivo pendente, ou null. Nao apaga: quem apaga e {@link #release}. */
    static Pending peek() {
        return pending;
    }

    /** Apaga a copia. Chamado quando a web termina de ler, e antes de cada chegada. */
    static void release() {
        final Pending current = pending;
        pending = null;
        if (current == null) return;

        final File blob = new File(current.path);
        // O retorno de `delete` e ignorado de proposito: se o arquivo ja nao
        // existe, o objetivo desta funcao ja esta cumprido.
        blob.delete();
    }

    /**
     * O nome que a pessoa reconhece.
     *
     * Ele importa mais do que parece: a cadeia inteira deriva o nome de saida do
     * `originalName` da sessao, entao um "arquivo" generico aqui vira
     * `arquivo-sem-fundo.png` la na frente. O ultimo segmento do Uri e o
     * substituto quando o provedor nao responde a consulta.
     */
    private static String displayName(final ContentResolver resolver, final Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) {
                final String name = cursor.getString(0);
                if (name != null && !name.isEmpty()) return name;
            }
        } catch (Exception ignored) {
            // Provedor que nao implementa a consulta: cai no ultimo segmento.
        }

        final String last = uri.getLastPathSegment();
        return last == null || last.isEmpty() ? "arquivo" : last;
    }

    /**
     * O tipo, perguntado ao RESOLVEDOR antes da intent.
     *
     * O tipo declarado na intent e o que o app que enviou ACHA que esta
     * mandando; o do resolvedor e o que o provedor do arquivo diz. Quando os
     * dois discordam, o segundo e o que abre. Vazio quando nenhum sabe — e o
     * lado web ja decide por extensao tambem (`containerOf` faz isso no video
     * pelo mesmo motivo).
     */
    private static String type(final ContentResolver resolver, final Intent intent, final Uri uri) {
        final String resolved = resolver.getType(uri);
        if (resolved != null && !resolved.isEmpty()) return resolved;

        final String declared = intent.getType();
        return declared == null ? "" : declared;
    }
}
