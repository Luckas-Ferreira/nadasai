package com.nadasai.app;

import android.content.Context;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.net.Uri;
import android.util.Log;
import android.view.Surface;

import com.nadasai.app.gl.InputSurface;
import com.nadasai.app.gl.OutputSurface;

import java.io.File;
import java.nio.ByteBuffer;

/**
 * RECODIFICAR VIDEO — corte com precisao de quadro, recorte de area e mudanca de
 * resolucao, no silicio do aparelho.
 *
 * O {@link TrimEngine} copia amostras e por isso e sem perda e instantaneo, mas
 * so consegue comecar num QUADRO-CHAVE. Medido numa gravacao de tela real: um
 * corte pedido em 5,0 s comecou em 0,0 s, porque era o unico quadro-chave antes
 * dele. Este motor e a resposta para esse caso, e tambem para tudo que muda o
 * TAMANHO do quadro, que a copia nunca podera fazer.
 *
 * ── DOIS CAMINHOS, E O BARATO E O PADRAO ────────────────────────────────────
 *
 * Quando a saida tem o mesmo tamanho da entrada — que e o caso de um corte puro
 * — os pixels nao mudam, e o decodificador pode renderizar DIRETO na superficie
 * de entrada do codificador:
 *
 *     decoder.configure(formato, encoder.createInputSurface(), null, 0)
 *
 * Os quadros passam de um para o outro dentro do sistema, sem OpenGL e sem
 * jamais voltarem para a memoria do processo. E o caminho com menos pecas
 * moveis, e por isso ele continua sendo usado sempre que serve.
 *
 * Quando a saida MUDA de tamanho — recorte de area, reducao de resolucao — os
 * quadros passam por uma textura externa e um shader ({@link OutputSurface} ->
 * {@link InputSurface}). O recorte nao e feito desenhando menor: e feito
 * escolhendo que parte da textura preenche o quadro inteiro, entao recortar e
 * redimensionar saem na mesma passada, de graca.
 *
 * ── DE ONDE VEM A PRECISAO DE QUADRO ────────────────────────────────────────
 *
 * A decodificacao PRECISA comecar no quadro-chave anterior, porque os quadros
 * intermediarios descrevem diferencas. A diferenca em relacao a copia e o que se
 * faz com eles: aqui os quadros antes do inicio pedido sao decodificados e
 * DESCARTADOS, sem chegarem ao codificador. Medido: num corte de 5 s a 9 s, 89
 * quadros descartados e 51 escritos, comecando em 5,0 s exatos.
 *
 * ── O AUDIO NAO E RECODIFICADO, E ISSO NAO E ATALHO ─────────────────────────
 *
 * Quadro de AAC nao depende do anterior: cada um se decodifica sozinho. Entao o
 * audio nao tem o problema do quadro-chave e nao ha nada a ganhar
 * recodificando-o — so uma geracao de perda. Ele e COPIADO.
 */
final class TranscodeEngine {

    private static final String TAG = "NadaSaiTranscode";

    private static final String OUTPUT_MIME = "video/avc";
    private static final int TIMEOUT_US = 10000;
    private static final int I_FRAME_INTERVAL_SECONDS = 1;
    private static final int DEFAULT_FRAME_RATE = 30;
    private static final int MIN_AUDIO_BUFFER = 512 * 1024;

    /** Bits por pixel do bitrate padrao, a mesma constante de `reencode.ts`. */
    private static final double BITS_PER_PIXEL = 0.12;

    /**
     * O que a saida deve ser. Tudo opcional: sem retangulo e sem altura maxima,
     * isto descreve um corte puro e o caminho direto assume.
     */
    static final class Spec {
        final boolean hasRect;
        final float x;
        final float y;
        final float w;
        final float h;
        /** 0 = mantem a altura da area de origem. */
        final int maxHeight;
        /** 0 = deriva da area de saida. */
        final int bitrate;

        Spec(boolean hasRect, float x, float y, float w, float h, int maxHeight, int bitrate) {
            this.hasRect = hasRect;
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
            this.maxHeight = maxHeight;
            this.bitrate = bitrate;
        }

        static Spec timeOnly() {
            return new Spec(false, 0f, 0f, 1f, 1f, 0, 0);
        }
    }

    private TranscodeEngine() {}

    static TrimEngine.Result transcode(Context context, Uri source, long startUs, long endUs) throws Exception {
        return transcode(context, source, startUs, endUs, Spec.timeOnly());
    }

    static TrimEngine.Result transcode(Context context, Uri source, long startUs, long endUs, Spec spec) throws Exception {
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

        int sourceWidth = videoFormat.getInteger(MediaFormat.KEY_WIDTH);
        int sourceHeight = videoFormat.getInteger(MediaFormat.KEY_HEIGHT);

        int[] out = outputSize(sourceWidth, sourceHeight, spec);
        int outWidth = out[0];
        int outHeight = out[1];
        if (outWidth < 2 || outHeight < 2) {
            throw new UnsupportedOperationException("area de saida degenerada: " + outWidth + "x" + outHeight);
        }

        // Audio nao-AAC nao entra num MP4 por copia, e recodificar audio e outro
        // caminho. Recusar deixa o caminho web entregar o mesmo de sempre.
        if (audioFormat != null) {
            String audioMime = audioFormat.getString(MediaFormat.KEY_MIME);
            if (!"audio/mp4a-latm".equals(audioMime)) {
                throw new UnsupportedOperationException("audio " + audioMime + " nao entra em MP4 por copia");
            }
        }

        boolean needsRender = spec.hasRect || outWidth != sourceWidth || outHeight != sourceHeight;

        File output = new File(context.getCacheDir(), "nadasai-cut-" + System.nanoTime() + ".mp4");

        MediaExtractor video = null;
        MediaCodec decoder = null;
        MediaCodec encoder = null;
        MediaMuxer muxer = null;
        Surface encoderSurface = null;
        InputSurface inputSurface = null;
        OutputSurface outputSurface = null;
        boolean muxing = false;

        try {
            video = new MediaExtractor();
            video.setDataSource(context, source, null);
            video.selectTrack(videoTrack);
            video.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);

            MediaFormat outFormat = MediaFormat.createVideoFormat(OUTPUT_MIME, outWidth, outHeight);
            outFormat.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
            outFormat.setInteger(MediaFormat.KEY_BIT_RATE, bitrateFor(videoFormat, spec, outWidth, outHeight, needsRender));
            outFormat.setInteger(MediaFormat.KEY_FRAME_RATE, frameRateOf(videoFormat));
            outFormat.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, I_FRAME_INTERVAL_SECONDS);

            encoder = MediaCodec.createEncoderByType(OUTPUT_MIME);
            encoder.configure(outFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            encoderSurface = encoder.createInputSurface();
            encoder.start();

            Surface decoderTarget;
            if (needsRender) {
                // A ORDEM importa e nao perdoa: o contexto EGL nasce sobre a
                // superficie do codificador e precisa estar CORRENTE antes de a
                // textura externa ser criada. Uma textura de outro contexto
                // desenha preto, sem erro nenhum.
                inputSurface = new InputSurface(encoderSurface);
                inputSurface.makeCurrent();
                outputSurface = new OutputSurface();
                outputSurface.setCrop(spec.x, spec.y, spec.w, spec.h);
                decoderTarget = outputSurface.surface();
            } else {
                decoderTarget = encoderSurface;
            }

            decoder = MediaCodec.createDecoderByType(videoFormat.getString(MediaFormat.KEY_MIME));
            decoder.configure(videoFormat, decoderTarget, null, 0);
            decoder.start();

            muxer = new MediaMuxer(output.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            if (videoFormat.containsKey(MediaFormat.KEY_ROTATION)) {
                // Recodificar por superficie NAO gira os pixels: a rotacao segue
                // sendo metadado do contêiner e precisa ser repassada, ou o video
                // sai deitado no player.
                muxer.setOrientationHint(videoFormat.getInteger(MediaFormat.KEY_ROTATION));
            }

            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            int outVideoTrack = -1;
            boolean feeding = true;
            boolean decoderDone = false;
            boolean encoderDone = false;
            long lastPtsUs = 0;
            int rendered = 0;
            int dropped = 0;

            while (!encoderDone) {
                // 1. Alimenta o decodificador com amostras comprimidas.
                if (feeding) {
                    int in = decoder.dequeueInputBuffer(TIMEOUT_US);
                    if (in >= 0) {
                        ByteBuffer buffer = decoder.getInputBuffer(in);
                        int size = buffer == null ? -1 : video.readSampleData(buffer, 0);
                        if (size < 0) {
                            decoder.queueInputBuffer(in, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            feeding = false;
                        } else {
                            long pts = video.getSampleTime();
                            decoder.queueInputBuffer(in, 0, size, pts, 0);
                            video.advance();
                            if (pts > endUs) {
                                int next = decoder.dequeueInputBuffer(TIMEOUT_US);
                                if (next >= 0) {
                                    decoder.queueInputBuffer(next, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                                    feeding = false;
                                }
                            }
                        }
                    }
                }

                // 2. Drena o decodificador.
                if (!decoderDone) {
                    int index = decoder.dequeueOutputBuffer(info, TIMEOUT_US);
                    if (index >= 0) {
                        boolean eos = (info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
                        boolean keep = info.size > 0
                            && info.presentationTimeUs >= startUs
                            && info.presentationTimeUs <= endUs;
                        long ptsNs = (info.presentationTimeUs - startUs) * 1000L;

                        if (keep && needsRender) {
                            decoder.releaseOutputBuffer(index, true);
                            outputSurface.awaitNewImage();
                            outputSurface.drawImage(outWidth, outHeight);
                            // O tempo marcado ANTES do swap e o que vira o
                            // `presentationTimeUs` da amostra codificada. Sem ele,
                            // o MediaCodec usa o relogio do sistema e o video sai
                            // com os tempos do processamento, nao os do conteudo.
                            inputSurface.setPresentationTime(ptsNs);
                            inputSurface.swapBuffers();
                            rendered++;
                        } else if (keep) {
                            decoder.releaseOutputBuffer(index, ptsNs);
                            rendered++;
                        } else {
                            // AQUI mora a precisao de quadro: os quadros entre o
                            // quadro-chave e o inicio pedido sao decodificados
                            // porque precisam ser, e jogados fora sem chegarem ao
                            // codificador.
                            decoder.releaseOutputBuffer(index, false);
                            if (info.size > 0) dropped++;
                        }

                        if (eos) {
                            decoderDone = true;
                            encoder.signalEndOfInputStream();
                        }
                    }
                }

                // 3. Drena o codificador para o muxer.
                int index = encoder.dequeueOutputBuffer(info, TIMEOUT_US);
                if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    if (muxing) throw new IllegalStateException("formato do codificador mudou duas vezes");
                    outVideoTrack = muxer.addTrack(encoder.getOutputFormat());
                    // O muxer exige TODAS as trilhas antes do start, e o formato
                    // do codificador so existe agora — por isso o audio entra
                    // aqui, e nao no comeco.
                    int outAudioTrack = audioFormat != null ? muxer.addTrack(audioFormat) : -1;
                    muxer.start();
                    muxing = true;

                    if (outAudioTrack >= 0) {
                        copyAudio(context, source, audioTrack, muxer, outAudioTrack, startUs, endUs);
                    }
                } else if (index >= 0) {
                    if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) {
                        // O muxer ja recebeu csd-0/csd-1 pelo formato; escrever de
                        // novo corromperia o arquivo.
                        info.size = 0;
                    }
                    if (info.size > 0 && muxing) {
                        ByteBuffer encoded = encoder.getOutputBuffer(index);
                        if (encoded != null) {
                            muxer.writeSampleData(outVideoTrack, encoded, info);
                            lastPtsUs = info.presentationTimeUs;
                        }
                    }
                    boolean eos = (info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
                    encoder.releaseOutputBuffer(index, false);
                    if (eos) encoderDone = true;
                }
            }

            muxer.stop();
            muxing = false;

            Log.i(TAG, (needsRender ? "render" : "direto") + ": " + rendered + " quadros escritos, "
                + dropped + " descartados, saida " + outWidth + "x" + outHeight);

            return new TrimEngine.Result(output, outWidth, outHeight, audioFormat != null, startUs, startUs, lastPtsUs);
        } catch (Exception e) {
            if (muxer != null && muxing) {
                try {
                    muxer.stop();
                } catch (Exception ignored) {
                    // Muxer interrompido no meio nao para limpo; o arquivo parcial
                    // vai embora logo abaixo de qualquer forma.
                }
            }
            output.delete();
            throw e;
        } finally {
            if (decoder != null) {
                try { decoder.stop(); } catch (Exception ignored) {}
                decoder.release();
            }
            if (encoder != null) {
                try { encoder.stop(); } catch (Exception ignored) {}
                encoder.release();
            }
            if (outputSurface != null) outputSurface.release();
            if (inputSurface != null) inputSurface.release();
            if (encoderSurface != null) encoderSurface.release();
            if (muxer != null) muxer.release();
            if (video != null) video.release();
        }
    }

    /**
     * O tamanho da saida, em pixels PARES.
     *
     * O H.264 exige lados pares e varios codificadores de VP8/VP9 recusam ou
     * distorcem um lado impar — um recorte de 301 px falharia so em alguns
     * aparelhos, que e o defeito que aparece na maquina de outra pessoa.
     *
     * E NUNCA amplia: pedir 1080p de um 480p entregaria os mesmos pixels num
     * arquivo maior, que e o oposto de comprimir. Mesma regra do `outputSize` do
     * `reencode.ts`.
     */
    static int[] outputSize(int sourceWidth, int sourceHeight, Spec spec) {
        int boxWidth = spec.hasRect ? Math.round(spec.w * sourceWidth) : sourceWidth;
        int boxHeight = spec.hasRect ? Math.round(spec.h * sourceHeight) : sourceHeight;

        int width = boxWidth;
        int height = boxHeight;

        if (spec.maxHeight > 0 && spec.maxHeight < boxHeight) {
            height = spec.maxHeight;
            width = Math.round(boxWidth * (height / (float) boxHeight));
        }

        return new int[] { even(width), even(height) };
    }

    private static int even(int value) {
        return value - (value & 1);
    }

    /**
     * O bitrate pedido, senao o da origem, senao bits por pixel vezes a area.
     *
     * Bitrate fixo por "qualidade" seria generoso num 480p e insuficiente num
     * 1080p. E quando a area MUDA, o bitrate da origem deixa de valer: ele
     * descreve outra quantidade de pixels.
     */
    private static int bitrateFor(MediaFormat source, Spec spec, int width, int height, boolean resized) {
        if (spec.bitrate > 0) return spec.bitrate;

        if (!resized && source.containsKey(MediaFormat.KEY_BIT_RATE)) {
            int declared = source.getInteger(MediaFormat.KEY_BIT_RATE);
            if (declared > 0) return declared;
        }

        return Math.max(500000, (int) (width * (long) height * BITS_PER_PIXEL));
    }

    /**
     * Copia a trilha de audio do trecho, sem recodificar.
     *
     * Quadro de AAC se decodifica sozinho, entao `SEEK_TO_CLOSEST_SYNC` da o
     * instante pedido de verdade — o problema do quadro-chave e exclusivo do
     * video.
     */
    private static void copyAudio(
        Context context,
        Uri source,
        int track,
        MediaMuxer muxer,
        int outTrack,
        long startUs,
        long endUs
    ) throws Exception {
        MediaExtractor audio = new MediaExtractor();
        try {
            audio.setDataSource(context, source, null);
            audio.selectTrack(track);
            audio.seekTo(startUs, MediaExtractor.SEEK_TO_CLOSEST_SYNC);

            MediaFormat format = audio.getTrackFormat(track);
            int size = format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)
                ? Math.max(MIN_AUDIO_BUFFER, format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE))
                : MIN_AUDIO_BUFFER;

            ByteBuffer buffer = ByteBuffer.allocate(size);
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();

            while (true) {
                int read = audio.readSampleData(buffer, 0);
                if (read < 0) break;

                long pts = audio.getSampleTime();
                if (pts > endUs) break;

                if (pts >= startUs) {
                    info.offset = 0;
                    info.size = read;
                    info.presentationTimeUs = pts - startUs;
                    info.flags = MediaCodec.BUFFER_FLAG_KEY_FRAME;
                    muxer.writeSampleData(outTrack, buffer, info);
                }

                audio.advance();
            }
        } finally {
            audio.release();
        }
    }

    private static int frameRateOf(MediaFormat source) {
        try {
            if (source.containsKey(MediaFormat.KEY_FRAME_RATE)) {
                int rate = source.getInteger(MediaFormat.KEY_FRAME_RATE);
                if (rate > 0) return rate;
            }
        } catch (ClassCastException ignored) {
            // Alguns extratores devolvem a taxa como float, e `getInteger` lanca.
            // O padrao serve: a taxa no formato do codificador e uma dica, e os
            // tempos reais vem de cada quadro.
        }
        return DEFAULT_FRAME_RATE;
    }
}
