/**
 * Incremental MD5.
 *
 * The algorithm is the one that was inlined in file-hash.component.ts; what
 * changed is the shape. That version took the whole ArrayBuffer and then
 * allocated a SECOND padded copy of it, so hashing the 500 MB the drag hint
 * advertised meant about a gigabyte resident, no progress bar, and a frozen
 * main thread. Feeding it 4 MB at a time costs a fixed 64 bytes of state.
 *
 * MD5 is here for checking downloads against a published checksum, which is the
 * only thing it is still good for. It is not a security primitive.
 */

const K = new Int32Array([
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]);

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

export interface Md5Hasher {
  update(chunk: Uint8Array): void;
  digest(): string;
}

export function createMd5(): Md5Hasher {
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const tail = new Uint8Array(64);
  const tailView = new DataView(tail.buffer);
  let tailLen = 0;
  let totalBytes = 0;
  let finished = false;

  const M = new Int32Array(16);

  function processBlock(view: DataView, offset: number): void {
    for (let j = 0; j < 16; j++) M[j] = view.getUint32(offset + j * 4, true);

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let g = 0; g < 64; g++) {
      let f: number;
      let idx: number;
      if (g < 16) {
        f = (b & c) | (~b & d);
        idx = g;
      } else if (g < 32) {
        f = (d & b) | (~d & c);
        idx = (5 * g + 1) % 16;
      } else if (g < 48) {
        f = b ^ c ^ d;
        idx = (3 * g + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        idx = (7 * g) % 16;
      }
      const temp = d;
      d = c;
      c = b;
      const sum = (a + f + K[g] + M[idx]) >>> 0;
      const rot = S[g];
      b = (b + ((sum << rot) | (sum >>> (32 - rot)))) >>> 0;
      a = temp;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return {
    update(chunk: Uint8Array): void {
      if (finished) throw new Error('md5: update after digest');
      totalBytes += chunk.length;
      let offset = 0;

      // Top up whatever is held over from the last chunk first, so block
      // boundaries stay independent of how the caller happened to slice.
      if (tailLen > 0) {
        const need = Math.min(64 - tailLen, chunk.length);
        tail.set(chunk.subarray(0, need), tailLen);
        tailLen += need;
        offset = need;
        if (tailLen === 64) {
          processBlock(tailView, 0);
          tailLen = 0;
        }
      }

      const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      while (offset + 64 <= chunk.length) {
        processBlock(view, offset);
        offset += 64;
      }

      if (offset < chunk.length) {
        tail.set(chunk.subarray(offset), tailLen);
        tailLen += chunk.length - offset;
      }
    },

    digest(): string {
      if (finished) throw new Error('md5: digest called twice');
      finished = true;

      const bitLen = totalBytes * 8;
      // 0x80, then zeros, then an 8-byte little-endian length. If the length
      // does not fit in this block it spills into one more.
      tail.fill(0, tailLen);
      tail[tailLen] = 0x80;

      if (tailLen >= 56) {
        processBlock(tailView, 0);
        tail.fill(0);
      }

      tailView.setUint32(56, bitLen >>> 0, true);
      tailView.setUint32(60, Math.floor(bitLen / 0x1_0000_0000), true);
      processBlock(tailView, 0);

      const hex = (n: number): string => {
        let s = '';
        for (let i = 0; i < 4; i++) s += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
        return s;
      };
      return hex(a0) + hex(b0) + hex(c0) + hex(d0);
    },
  };
}

export function md5(bytes: Uint8Array): string {
  const h = createMd5();
  h.update(bytes);
  return h.digest();
}
