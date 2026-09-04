package com.nada.sai;

import android.content.Context;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.net.Uri;

import java.io.File;
import java.nio.ByteBuffer;

/**
 * CORTAR VIDEO NO TEMPO, SEM RECODIFICAR — a maquina, separada da fiacao.
 *
 * O caminho web de `core/video/reencode.ts` toca o video escondido, redesenha
 * cada quadro num canvas e grava com o MediaRecorder. Funciona em qualquer
 * navegador e custa o que o proprio arquivo dele diz: **leva a duracao do
 * trecho**, porque audio so se captura em tempo real, e ainda perde uma geracao
 * de compressao.
 *
 * Cortar no TEMPO nao precisa de codec nenhum. As amostras ja comprimidas sao
 * copiadas de um contêiner para outro:
 *
 *     MediaExtractor le as amostras  ->  MediaMuxer as escreve
 *
 * Duas consequencias, e as duas sao melhoria e nao so velocidade: e velocidade
 * de DISCO, entao o custo acompanha o tamanho do trecho e nao a duracao dele; e
 * e SEM PERDA, porque nenhum pixel chega a ser decodificado.
 *
 * ── POR QUE ISTO NAO E O PLUGIN ─────────────────────────────────────────────
 *
 * O {@link VideoPlugin} traduz JSON e resolve origem; isto le e escreve midia.
 * Separados, a parte dificil pode ser exercitada sem Capacitor, sem WebView e
 * sem seletor de arquivo — que foi como ela foi verificada a primeira vez.
 * Juntos, a unica forma de testar seria dirigindo a interface.
 *
 * ── O QUE ELE RECUSA, E POR QUE RECUSAR E O CERTO ───────────────────────────
 *
 * Copia de amostra so vale quando NADA nos pixels muda: recorte de area,
 * resolucao e bitrate exigem decodificar e recodificar de verdade. E o contêiner
 * manda — MP4 aceita H.264/H.265 com AAC, enquanto VP8/VP9/Opus vivem em WebM e
 * nao entram num MP4 por copia. Nesses casos lanca
 * {@link UnsupportedOperationException}, o plugin responde "UNSUPPORTED" e o JS
 * segue pelo caminho web: o mesmo resultado de hoje, so que devagar.
 * Improvisar aqui produziria um arquivo corrompido que so apareceria como
 * defeito no aparelho de outra pessoa.
 */
final class TrimEngine {

    /** Piso do buffer de amostra quando o formato nao declara o maximo. */
    private static final int MIN_BUFFER = 1024 * 1024;

    static final class Result {
        final File file;
        final int width;
        final int height;
        final boolean hasAudio;
        final long requestedStartUs;
        final long actualStartUs;
        final long durationUs;

        Result(File file, int width, int height, boolean hasAudio, long requestedStartUs, long actualStartUs, long durationUs) {
            this.file = file;
            this.width = width;
            this.height = height;
            this.hasAudio = hasAudio;
            this.requestedStartUs = requestedStartUs;
            this.actualStartUs = actualStartUs;
            this.durationUs = durationUs;
        }
    }

    private TrimEngine() {}

    /**
     * O tempo do quadro-chave igual ou anterior a `startUs`, ou -1.
     *
     * E o que decide, ANTES de qualquer trabalho, se a copia serve: se este
     * instante e o pedido praticamente coincidem, a copia entrega um corte exato
     * e sem perda; se nao, quem corta e o {@link TranscodeEngine}. Custa um seek
     * e nada mais — descobrir isso copiando o arquivo inteiro para so entao joga-
     * lo fora seria pagar o trabalho duas vezes.
     */
    static long keyframeAtOrBefore(Context context, Uri source, long startUs) {
        MediaExtractor extractor = new MediaExtractor();
        try {
            extractor.setDataSource(context, source, null);
            for (int i = 0; i < extractor.getTrackCount(); i++) {
                String mime = extractor.getTrackFormat(i).getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("video/")) {
                    extractor.selectTrack(i);
                    extractor.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
                    return extractor.getSampleTime();
                }
            }
            return -1;
        } catch (Exception e) {
            return -1;
        } finally {
            extractor.release();
        }
    }

    static Result copy(Context context, Uri source, long startUs, long endUs) throws Exception {
        int videoTrack = -1;
        int audioTrack = -1;
        MediaFormat videoFormat = null;
        MediaFormat audioFormat = null;

        MediaExtractor probe = new MediaExtractor();
        try {
            probe.setDataSource(context, source, null);
            for (int i = 0; i < probe.getTrackCount(); i++) {
                MediaFormat format = probe.getTrackFormat(i);
                String mime = format.getString(MediaFormat.KEY_MIME);
                if (mime == null) continue;
                if (videoTrack < 0 && mime.startsWith("video/")) {
                    videoTrack = i;
                    videoFormat = format;
                } else if (audioTrack < 0 && mime.startsWith("audio/")) {
                    audioTrack = i;
                    audioFormat = format;
                }
            }
        } finally {
            probe.release();
        }

        if (videoFormat == null) throw new UnsupportedOperationException("arquivo sem trilha de video");

        String videoMime = videoFormat.getString(MediaFormat.KEY_MIME);
        if (!"video/avc".equals(videoMime) && !"video/hevc".equals(videoMime)) {
            throw new UnsupportedOperationException("video " + videoMime + " nao entra em MP4 por copia");
        }
        if (audioFormat != null) {
            String audioMime = audioFormat.getString(MediaFormat.KEY_MIME);
            if (!"audio/mp4a-latm".equals(audioMime)) {
                // Descartar a trilha entregaria um video mudo em silencio, que e
                // pior do que ser lento.
                throw new UnsupportedOperationException("audio " + audioMime + " nao entra em MP4 por copia");
            }
        }

        File output = new File(context.getCacheDir(), "nadasai-trim-" + System.nanoTime() + ".mp4");

        MediaExtractor video = null;
        MediaExtractor audio = null;
        MediaMuxer muxer = null;
        boolean started = false;

        try {
            video = new MediaExtractor();
            video.setDataSource(context, source, null);
            video.selectTrack(videoTrack);

            // O quadro-chave igual ou anterior ao pedido: e o primeiro ponto a
            // partir do qual as amostras seguintes sao decodificaveis. Um quadro
            // intermediario descreve a DIFERENCA em relacao ao anterior, entao
            // comecar nele entregaria lixo ate o proximo quadro-chave.
            video.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            long actualStartUs = video.getSampleTime();
            if (actualStartUs < 0) {
                throw new UnsupportedOperationException("nenhuma amostra a partir do inicio pedido");
            }

            muxer = new MediaMuxer(output.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);

            // A rotacao vive no contêiner, nao nos pixels. Sem repassar, um video
            // gravado em pe sai deitado — e o defeito so aparece no player.
            if (videoFormat.containsKey(MediaFormat.KEY_ROTATION)) {
                muxer.setOrientationHint(videoFormat.getInteger(MediaFormat.KEY_ROTATION));
            }

            int outVideo = muxer.addTrack(videoFormat);
            int outAudio = -1;

            if (audioFormat != null) {
                // Extrator PROPRIO para o audio: `seekTo` move todas as trilhas
                // selecionadas de um mesmo extrator, entao duas trilhas num
                // extrator so nao podem ser posicionadas de forma independente.
                audio = new MediaExtractor();
                audio.setDataSource(context, source, null);
                audio.selectTrack(audioTrack);
                audio.seekTo(actualStartUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
                outAudio = muxer.addTrack(audioFormat);
            }

            muxer.start();
            started = true;

            ByteBuffer buffer = ByteBuffer.allocate(bufferSize(videoFormat, audioFormat));
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();

            long durationUs = copyTrack(video, muxer, outVideo, buffer, info, actualStartUs, endUs);
            if (audio != null) {
                copyTrack(audio, muxer, outAudio, buffer, info, actualStartUs, endUs);
            }

            muxer.stop();
            started = false;

            return new Result(
                output,
                videoFormat.containsKey(MediaFormat.KEY_WIDTH) ? videoFormat.getInteger(MediaFormat.KEY_WIDTH) : 0,
                videoFormat.containsKey(MediaFormat.KEY_HEIGHT) ? videoFormat.getInteger(MediaFormat.KEY_HEIGHT) : 0,
                audioFormat != null,
                startUs,
                actualStartUs,
                durationUs
            );
        } catch (Exception e) {
            if (muxer != null && started) {
                try {
                    muxer.stop();
                } catch (Exception ignored) {
                    // Um muxer interrompido no meio nao para limpo, e o arquivo
                    // parcial vai embora na linha seguinte de qualquer forma.
                }
            }
            output.delete();
            throw e;
        } finally {
            if (muxer != null) muxer.release();
            if (video != null) video.release();
            if (audio != null) audio.release();
        }
    }

    /**
     * Copia as amostras de [baseUs, endUs], reancorando o tempo em zero.
     *
     * Sem reancorar, o MP4 sairia com a primeira amostra em, digamos, 12,4 s, e
     * os players tratam isso de formas diferentes — alguns mostram 12 s de nada
     * no comeco. Devolve o ultimo tempo escrito, que e a duracao real do corte.
     */
    private static long copyTrack(
        MediaExtractor extractor,
        MediaMuxer muxer,
        int track,
        ByteBuffer buffer,
        MediaCodec.BufferInfo info,
        long baseUs,
        long endUs
    ) {
        long last = 0;

        while (true) {
            int size = extractor.readSampleData(buffer, 0);
            if (size < 0) break;

            long pts = extractor.getSampleTime();
            if (pts > endUs) break;

            if (pts >= baseUs) {
                info.offset = 0;
                info.size = size;
                info.presentationTimeUs = pts - baseUs;
                info.flags = (extractor.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) != 0
                    ? MediaCodec.BUFFER_FLAG_KEY_FRAME
                    : 0;
                muxer.writeSampleData(track, buffer, info);
                last = info.presentationTimeUs;
            }

            extractor.advance();
        }

        return last;
    }

    /**
     * Um buffer menor que a maior amostra faz o `readSampleData` falhar no meio
     * do arquivo — tipicamente num quadro-chave, que e a amostra maior.
     */
    private static int bufferSize(MediaFormat video, MediaFormat audio) {
        int size = MIN_BUFFER;
        if (video != null && video.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
            size = Math.max(size, video.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE));
        }
        if (audio != null && audio.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
            size = Math.max(size, audio.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE));
        }
        return size;
    }
}
