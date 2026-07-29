import { encodeWav, wavByteLength } from './wav';

async function bytesOf(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer());
}

function ascii(view: DataView, offset: number, length: number): string {
  let text = '';
  for (let i = 0; i < length; i++) text += String.fromCharCode(view.getUint8(offset + i));
  return text;
}

describe('encodeWav', () => {
  it('writes a RIFF/WAVE header a decoder can follow', async () => {
    const blob = encodeWav([new Float32Array([0, 0, 0, 0])], 44100);
    const view = await bytesOf(blob);

    expect(blob.type).toBe('audio/wav');
    expect(ascii(view, 0, 4)).toBe('RIFF');
    expect(ascii(view, 8, 4)).toBe('WAVE');
    expect(ascii(view, 12, 4)).toBe('fmt ');
    expect(ascii(view, 36, 4)).toBe('data');

    expect(view.getUint16(20, true)).toBe(1); // uncompressed PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(view.getUint32(40, true)).toBe(8); // 4 frames x 1 channel x 2 bytes
    expect(view.getUint32(4, true)).toBe(36 + 8);
  });

  it('derives byte rate and block align from the channel count', async () => {
    const view = await bytesOf(encodeWav([new Float32Array(2), new Float32Array(2)], 48000));

    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint16(32, true)).toBe(4); // block align: 2 ch x 2 bytes
    expect(view.getUint32(28, true)).toBe(48000 * 4);
  });

  it('interleaves the channels frame by frame', async () => {
    const left = new Float32Array([1, 0]);
    const right = new Float32Array([0, -1]);
    const view = await bytesOf(encodeWav([left, right], 8000));

    expect(view.getInt16(44, true)).toBe(32767); // frame 0, left
    expect(view.getInt16(46, true)).toBe(0); // frame 0, right
    expect(view.getInt16(48, true)).toBe(0); // frame 1, left
    expect(view.getInt16(50, true)).toBe(-32768); // frame 1, right
  });

  it('maps full scale asymmetrically, so a peak of 1 does not wrap around', async () => {
    // Scaling both directions by 32768 turns +1.0 into -32768: a full-scale
    // positive peak comes back as the loudest possible negative sample, which is
    // a crackle on every loud transient.
    const view = await bytesOf(encodeWav([new Float32Array([1, -1])], 8000));

    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });

  it('clamps samples outside [-1, 1] instead of letting them wrap', async () => {
    const view = await bytesOf(encodeWav([new Float32Array([4, -4])], 8000));

    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });

  it('predicts its own length, which is what the size readout promises', async () => {
    const blob = encodeWav([new Float32Array(1000), new Float32Array(1000)], 44100);
    expect(blob.size).toBe(wavByteLength(1000, 2));
  });
});
