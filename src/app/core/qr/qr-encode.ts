/**
 * Pure TypeScript QR Code generator (ISO/IEC 18004 compliant).
 *
 * Implements byte-mode, numeric and alphanumeric encoding, Reed-Solomon error
 * correction across GF(256), masking patterns 0-7 with penalty scoring, and
 * versions 1 to 40.
 *
 * 100% client-side, zero dependencies.
 */

export type QrEccLevel = 'L' | 'M' | 'Q' | 'H';

export class QrSegment {
  constructor(
    public readonly mode: 'NUMERIC' | 'ALPHANUMERIC' | 'BYTE',
    public readonly numChars: number,
    public readonly bitData: number[],
  ) {
    if (numChars < 0) throw new RangeError('Invalid character count');
  }

  static makeBytes(data: Uint8Array | number[]): QrSegment {
    const bitData: number[] = [];
    for (const b of data) {
      for (let i = 7; i >= 0; i--) {
        bitData.push((b >>> i) & 1);
      }
    }
    return new QrSegment('BYTE', data.length, bitData);
  }

  static makeNumeric(digits: string): QrSegment {
    if (!/^[0-9]*$/.test(digits)) throw new Error('String contains non-numeric characters');
    const bitData: number[] = [];
    let i = 0;
    while (i <= digits.length - 3) {
      const val = parseInt(digits.substring(i, i + 3), 10);
      for (let j = 9; j >= 0; j--) bitData.push((val >>> j) & 1);
      i += 3;
    }
    if (digits.length - i === 2) {
      const val = parseInt(digits.substring(i, i + 2), 10);
      for (let j = 5; j >= 0; j--) bitData.push((val >>> j) & 1);
    } else if (digits.length - i === 1) {
      const val = parseInt(digits.substring(i, i + 1), 10);
      for (let j = 3; j >= 0; j--) bitData.push((val >>> j) & 1);
    }
    return new QrSegment('NUMERIC', digits.length, bitData);
  }

  static makeAlphanumeric(text: string): QrSegment {
    const ALPHANUMERIC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
    const bitData: number[] = [];
    let i = 0;
    while (i <= text.length - 2) {
      const v1 = ALPHANUMERIC_CHARS.indexOf(text.charAt(i));
      const v2 = ALPHANUMERIC_CHARS.indexOf(text.charAt(i + 1));
      if (v1 === -1 || v2 === -1) throw new Error('String contains non-alphanumeric characters');
      const val = v1 * 45 + v2;
      for (let j = 10; j >= 0; j--) bitData.push((val >>> j) & 1);
      i += 2;
    }
    if (text.length - i === 1) {
      const v = ALPHANUMERIC_CHARS.indexOf(text.charAt(i));
      if (v === -1) throw new Error('String contains non-alphanumeric characters');
      for (let j = 5; j >= 0; j--) bitData.push((v >>> j) & 1);
    }
    return new QrSegment('ALPHANUMERIC', text.length, bitData);
  }

  static makeSegments(text: string): QrSegment[] {
    if (text === '') return [];
    if (/^[0-9]+$/.test(text)) return [QrSegment.makeNumeric(text)];
    if (/^[0-9A-Z $%*+\-./:]+$/.test(text)) return [QrSegment.makeAlphanumeric(text)];
    const encoder = new TextEncoder();
    return [QrSegment.makeBytes(encoder.encode(text))];
  }
}

export class QrCode {
  readonly size: number;
  private readonly modules: boolean[][];
  private readonly isFunction: boolean[][];

  private constructor(
    public readonly version: number,
    public readonly errorCorrectionLevel: QrEccLevel,
    dataCodewords: Uint8Array,
    mask: number,
  ) {
    if (version < 1 || version > 40) throw new RangeError('Version out of range 1..40');
    if (mask < -1 || mask > 7) throw new RangeError('Mask out of range');

    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => Array(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => Array(this.size).fill(false));

    this.drawFunctionPatterns();
    const allCodewords = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(allCodewords);

    if (mask === -1) {
      let minPenalty = 1e9;
      let bestMask = 0;
      for (let m = 0; m < 8; m++) {
        this.applyMask(m);
        this.drawFormatBits(m);
        const penalty = this.getPenaltyScore();
        if (penalty < minPenalty) {
          minPenalty = penalty;
          bestMask = m;
        }
        this.applyMask(m); // unmask
      }
      mask = bestMask;
    }
    this.applyMask(mask);
    this.drawFormatBits(mask);
  }

  getModule(x: number, y: number): boolean {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) return false;
    return this.modules[y][x];
  }

  static encodeText(text: string, ecl: QrEccLevel = 'M'): QrCode {
    const segs = QrSegment.makeSegments(text);
    return QrCode.encodeSegments(segs, ecl);
  }

  static encodeBinary(data: Uint8Array, ecl: QrEccLevel = 'M'): QrCode {
    const seg = QrSegment.makeBytes(data);
    return QrCode.encodeSegments([seg], ecl);
  }

  static encodeSegments(
    segs: readonly QrSegment[],
    ecl: QrEccLevel,
    minVersion = 1,
    maxVersion = 40,
    mask = -1,
  ): QrCode {
    for (let version = minVersion; version <= maxVersion; version++) {
      const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;
      const dataUsedBits = QrCode.getTotalBits(segs, version);
      if (dataUsedBits <= dataCapacityBits) {
        // Assemble bits
        const bb: number[] = [];
        for (const seg of segs) {
          appendBits(getModeIndicator(seg.mode), 4, bb);
          appendBits(seg.numChars, getNumCharCountBits(seg.mode, version), bb);
          for (const b of seg.bitData) bb.push(b);
        }
        // Terminator
        const terminatorBits = Math.min(4, dataCapacityBits - bb.length);
        appendBits(0, terminatorBits, bb);
        // Pad to byte
        appendBits(0, (8 - (bb.length % 8)) % 8, bb);
        // Pad bytes
        const padBytes = [0xec, 0x11];
        let padIndex = 0;
        while (bb.length < dataCapacityBits) {
          appendBits(padBytes[padIndex], 8, bb);
          padIndex = (padIndex + 1) % 2;
        }

        const dataCodewords = new Uint8Array(bb.length / 8);
        for (let i = 0; i < dataCodewords.length; i++) {
          let byte = 0;
          for (let j = 0; j < 8; j++) byte = (byte << 1) | bb[i * 8 + j];
          dataCodewords[i] = byte;
        }
        return new QrCode(version, ecl, dataCodewords, mask);
      }
    }
    throw new Error('Data too long for QR code version range');
  }

  private static getTotalBits(segs: readonly QrSegment[], version: number): number {
    let result = 0;
    for (const seg of segs) {
      const charCountBits = getNumCharCountBits(seg.mode, version);
      result += 4 + charCountBits + seg.bitData.length;
    }
    return result;
  }

  private drawFunctionPatterns(): void {
    // Timing patterns
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }
    // Finder patterns & separators
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);

    // Alignment patterns
    const alignPos = getAlignmentPatternPositions(this.version);
    const numAlign = alignPos.length;
    for (let i = 0; i < numAlign; i++) {
      for (let j = 0; j < numAlign; j++) {
        if (
          (i === 0 && j === 0) ||
          (i === 0 && j === numAlign - 1) ||
          (i === numAlign - 1 && j === 0)
        ) {
          continue;
        }
        this.drawAlignmentPattern(alignPos[i], alignPos[j]);
      }
    }

    // Format info dummy
    this.drawFormatBits(0);
    // Version info dummy if v >= 7
    this.drawVersion();
  }

  private drawFinderPattern(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && px < this.size && py >= 0 && py < this.size) {
          this.setFunctionModule(px, py, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  private drawAlignmentPattern(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        this.setFunctionModule(x + dx, y + dy, dist !== 1);
      }
    }
  }

  private setFunctionModule(x: number, y: number, isDark: boolean): void {
    this.modules[y][x] = isDark;
    this.isFunction[y][x] = true;
  }

  private drawFormatBits(mask: number): void {
    const format = getFormatBits(this.errorCorrectionLevel, mask);
    // Draw first copy
    for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, ((format >>> i) & 1) !== 0);
    this.setFunctionModule(8, 7, ((format >>> 6) & 1) !== 0);
    this.setFunctionModule(8, 8, ((format >>> 7) & 1) !== 0);
    this.setFunctionModule(7, 8, ((format >>> 8) & 1) !== 0);
    for (let i = 9; i < 15; i++) this.setFunctionModule(14 - i, 8, ((format >>> i) & 1) !== 0);

    // Draw second copy
    for (let i = 0; i < 8; i++) this.setFunctionModule(this.size - 1 - i, 8, ((format >>> i) & 1) !== 0);
    for (let i = 8; i < 15; i++) this.setFunctionModule(8, this.size - 15 + i, ((format >>> i) & 1) !== 0);
    this.setFunctionModule(8, this.size - 8, true); // Dark module
  }

  private drawVersion(): void {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;

    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) !== 0;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunctionModule(a, b, bit);
      this.setFunctionModule(b, a, bit);
    }
  }

  private addEccAndInterleave(data: Uint8Array): Uint8Array {
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[getEccIndex(this.errorCorrectionLevel)][this.version];
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[getEccIndex(this.errorCorrectionLevel)][this.version];
    const rawCodewords = Math.floor(getNumRawDataModules(this.version) / 8);
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);

    const blocks: Uint8Array[] = [];
    const rs = new ReedSolomonGenerator(blockEccLen);

    let k = 0;
    for (let i = 0; i < numBlocks; i++) {
      const dataLen = shortBlockLen - blockEccLen + (i >= numShortBlocks ? 1 : 0);
      const blockData = data.subarray(k, k + dataLen);
      k += dataLen;
      const ecc = rs.getRemainder(blockData);
      const fullBlock = new Uint8Array(blockData.length + ecc.length);
      fullBlock.set(blockData, 0);
      fullBlock.set(ecc, blockData.length);
      blocks.push(fullBlock);
    }

    const result = new Uint8Array(rawCodewords);
    let outIdx = 0;
    const maxBlockLen = blocks[blocks.length - 1].length;
    for (let i = 0; i < maxBlockLen; i++) {
      for (let j = 0; j < blocks.length; j++) {
        if (i < blocks[j].length) {
          result[outIdx++] = blocks[j][i];
        }
      }
    }
    return result;
  }

  private drawCodewords(data: Uint8Array): void {
    let bitIndex = 0;
    let right = this.size - 1;
    while (right >= 1) {
      if (right === 6) right = 5; // Skip timing column
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && bitIndex < data.length * 8) {
            this.modules[y][x] = ((data[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
            bitIndex++;
          }
        }
      }
      right -= 2;
    }
  }

  private applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.isFunction[y][x]) continue;
        let invert = false;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        }
        if (invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  private getPenaltyScore(): number {
    let result = 0;
    // N1: Adjacent modules in row/column with same color
    for (let y = 0; y < this.size; y++) {
      let runColor = false;
      let runVal = 0;
      for (let x = 0; x < this.size; x++) {
        if (x === 0 || this.modules[y][x] !== runColor) {
          runColor = this.modules[y][x];
          runVal = 1;
        } else {
          runVal++;
          if (runVal === 5) result += 3;
          else if (runVal > 5) result++;
        }
      }
    }
    for (let x = 0; x < this.size; x++) {
      let runColor = false;
      let runVal = 0;
      for (let y = 0; y < this.size; y++) {
        if (y === 0 || this.modules[y][x] !== runColor) {
          runColor = this.modules[y][x];
          runVal = 1;
        } else {
          runVal++;
          if (runVal === 5) result += 3;
          else if (runVal > 5) result++;
        }
      }
    }
    // N2: 2x2 blocks
    for (let y = 0; y < this.size - 1; y++) {
      for (let x = 0; x < this.size - 1; x++) {
        const color = this.modules[y][x];
        if (
          color === this.modules[y][x + 1] &&
          color === this.modules[y + 1][x] &&
          color === this.modules[y + 1][x + 1]
        ) {
          result += 3;
        }
      }
    }
    // N3: Finder-like patterns
    for (let y = 0; y < this.size; y++) {
      let bits = 0;
      for (let x = 0; x < this.size; x++) {
        bits = ((bits << 1) & 0x7ff) | (this.modules[y][x] ? 1 : 0);
        if (x >= 10 && (bits === 0x05d || bits === 0x5d0)) result += 40;
      }
    }
    for (let x = 0; x < this.size; x++) {
      let bits = 0;
      for (let y = 0; y < this.size; y++) {
        bits = ((bits << 1) & 0x7ff) | (this.modules[y][x] ? 1 : 0);
        if (y >= 10 && (bits === 0x05d || bits === 0x5d0)) result += 40;
      }
    }
    // N4: Balance of dark and light modules
    let dark = 0;
    for (const row of this.modules) {
      for (const color of row) if (color) dark++;
    }
    const total = this.size * this.size;
    const k = Math.ceil(Math.abs((dark * 100) / total - 50) / 5) - 1;
    result += k * 10;
    return result;
  }

  static getNumDataCodewords(version: number, ecl: QrEccLevel): number {
    return (
      Math.floor(getNumRawDataModules(version) / 8) -
      ECC_CODEWORDS_PER_BLOCK[getEccIndex(ecl)][version] *
        NUM_ERROR_CORRECTION_BLOCKS[getEccIndex(ecl)][version]
    );
  }
}

// Helpers & Tables

function appendBits(val: number, len: number, bb: number[]): void {
  for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
}

function getModeIndicator(mode: string): number {
  switch (mode) {
    case 'NUMERIC': return 0x1;
    case 'ALPHANUMERIC': return 0x2;
    case 'BYTE': return 0x4;
    default: return 0x4;
  }
}

function getNumCharCountBits(mode: string, version: number): number {
  const i = Math.floor((version + 7) / 17);
  switch (mode) {
    case 'NUMERIC': return [10, 12, 14][i];
    case 'ALPHANUMERIC': return [9, 11, 13][i];
    case 'BYTE': return [8, 16, 16][i];
    default: return [8, 16, 16][i];
  }
}

function getEccIndex(ecl: QrEccLevel): number {
  switch (ecl) {
    case 'L': return 0;
    case 'M': return 1;
    case 'Q': return 2;
    case 'H': return 3;
  }
}

function getFormatBits(ecl: QrEccLevel, mask: number): number {
  const data = (getEccIndex(ecl) ^ 1) << 3 | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function getNumRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function getAlignmentPatternPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result: number[] = [6];
  for (let pos = version * 4 + 10; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

class ReedSolomonGenerator {
  private readonly coefficients: Uint8Array;

  constructor(degree: number) {
    if (degree < 1 || degree > 255) throw new RangeError('Degree out of range');
    this.coefficients = new Uint8Array(degree);
    this.coefficients[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < this.coefficients.length; j++) {
        this.coefficients[j] = ReedSolomonGenerator.multiply(this.coefficients[j], root);
        if (j + 1 < this.coefficients.length) {
          this.coefficients[j] ^= this.coefficients[j + 1];
        }
      }
      root = ReedSolomonGenerator.multiply(root, 0x02);
    }
  }

  getRemainder(data: Uint8Array): Uint8Array {
    const result = new Uint8Array(this.coefficients.length);
    for (const b of data) {
      const factor = b ^ result[0];
      result.copyWithin(0, 1);
      result[result.length - 1] = 0;
      for (let i = 0; i < result.length; i++) {
        result[i] ^= ReedSolomonGenerator.multiply(this.coefficients[i], factor);
      }
    }
    return result;
  }

  private static multiply(x: number, y: number): number {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
}

const ECC_CODEWORDS_PER_BLOCK: number[][] = [
  // Version: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ...
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // L
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], // M
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // Q
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // H
];

const NUM_ERROR_CORRECTION_BLOCKS: number[][] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25], // L
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49], // M
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68], // Q
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81], // H
];
