import { Injectable, inject } from '@angular/core';
import { applyChannelOperation, type ChannelOperation } from '../../../core/audio/channels';
import { encodeWav } from '../../../core/audio/wav';
import { AudioConverterService } from '../../convert-audio/services/audio-converter.service';

export type ChannelOutputFormat = 'wav' | 'mp3';

export interface ChannelSplitOptions {
  readonly buffer: AudioBuffer;
  readonly operation: ChannelOperation;
  readonly format: ChannelOutputFormat;
  readonly bitrate: string;
}

export interface ChannelSplitResult {
  readonly blob: Blob;
  readonly ext: string;
  readonly channels: number;
}

/**
 * Separar, juntar e trocar canais.
 *
 * A conta inteira mora em `core/audio/channels.ts`; aqui só se decide o que
 * escrever. Duas coisas valem registro:
 *
 *   * **WAV é o padrão, e por isso a operação é sem perda de ponta a ponta.**
 *     Extrair o canal esquerdo de um WAV e gravar WAV não descarta nada — o
 *     Float32 que saiu do decodificador é o que entra no arquivo. Escolher MP3
 *     acrescenta uma geração de compressão, e é oferecido porque o caso comum
 *     ("meu áudio só toca de um lado") termina num arquivo para enviar, não num
 *     master.
 *   * **O encoder de MP3 vem do `AudioConverterService`**, injetado em vez de
 *     importado direto — é a mesma regra que compress-audio e normalize-audio
 *     seguem, e o motivo é haver UMA porta para o lamejs.
 */
@Injectable({ providedIn: 'root' })
export class AudioChannelsService {
  private readonly converter = inject(AudioConverterService);

  async split(options: ChannelSplitOptions): Promise<ChannelSplitResult> {
    const { buffer, operation, format } = options;

    const source: Float32Array[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) source.push(buffer.getChannelData(c));

    const out = applyChannelOperation(source, operation);

    if (format === 'mp3') {
      const blob = this.converter.encodeToMp3(
        toAudioBuffer(out, buffer.sampleRate),
        Number.parseInt(options.bitrate, 10),
      );
      return { blob, ext: 'mp3', channels: out.length };
    }

    return {
      blob: encodeWav(out, buffer.sampleRate),
      ext: 'wav',
      channels: out.length,
    };
  }
}

/**
 * Embrulha os canais num `AudioBuffer` porque é isso que o encoder de MP3 pede.
 *
 * `OfflineAudioContext` e não `AudioContext`: o offline não precisa de gesto do
 * usuário nem de dispositivo de saída, e aqui ninguém vai tocar nada — só se
 * quer a fábrica de buffer. Um `AudioContext` de verdade abriria hardware para
 * não usar, e num Karma headless nem sequer sai do estado suspenso.
 */
function toAudioBuffer(channels: readonly Float32Array[], sampleRate: number): AudioBuffer {
  const length = channels[0]?.length ?? 0;
  const ctx = new OfflineAudioContext(channels.length, Math.max(1, length), sampleRate);
  const buffer = ctx.createBuffer(channels.length, Math.max(1, length), sampleRate);

  for (let c = 0; c < channels.length; c++) buffer.copyToChannel(channels[c], c);
  return buffer;
}
