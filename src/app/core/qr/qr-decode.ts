/**
 * Pure TypeScript QR Code Decoder.
 *
 * Implements adaptive threshold binarization, finder pattern detection (1:1:3:1:1 ratio
 * with bidirectional horizontal & vertical cross-checking), geometric triplet scoring,
 * bilinear sampling, and Reed-Solomon codeword de-interleaving and bitstream parsing.
 *
 * Runs 100% client-side with zero external dependencies.
 */

export interface QrDecodeResult {
  readonly text: string;
  readonly binaryData: Uint8Array;
  readonly version: number;
}

export function decodeQrFromImageData(imageData: ImageData): QrDecodeResult | null {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  if (width < 21 || height < 21) return null;

  // 1. Grayscale + Binarization
  const binarized = binarize(data, width, height);

  // 2. Locate finder patterns
  const finderCenters = findFinderPatternCenters(binarized, width, height);
  if (finderCenters.length < 3) {
    // Try inverted binarization (for dark theme / inverted QRs)
    const inverted = new Uint8Array(binarized.length);
    for (let i = 0; i < binarized.length; i++) inverted[i] = binarized[i] === 0 ? 1 : 0;
    const invCenters = findFinderPatternCenters(inverted, width, height);
    if (invCenters.length < 3) return null;
    return decodeWithFinderPatterns(inverted, width, height, invCenters);
  }

  const res = decodeWithFinderPatterns(binarized, width, height, finderCenters);
  if (res) return res;

  // Fallback try inverted
  const inverted = new Uint8Array(binarized.length);
  for (let i = 0; i < binarized.length; i++) inverted[i] = binarized[i] === 0 ? 1 : 0;
  const invCenters = findFinderPatternCenters(inverted, width, height);
  if (invCenters.length >= 3) {
    return decodeWithFinderPatterns(inverted, width, height, invCenters);
  }

  return null;
}

// Binarization with local adaptive threshold and low-contrast fallback
function binarize(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  let min = 255;
  let max = 0;
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const val = (r * 77 + g * 150 + b * 29) >>> 8;
    gray[i] = val;
    if (val < min) min = val;
    if (val > max) max = val;
  }

  const globalThreshold = (min + max) >> 1;
  const binary = new Uint8Array(width * height);
  const blockSize = Math.max(8, Math.min(32, Math.floor(Math.min(width, height) / 16)));
  const halfBlock = blockSize >> 1;

  for (let y = 0; y < height; y++) {
    const yMin = Math.max(0, y - halfBlock);
    const yMax = Math.min(height - 1, y + halfBlock);
    for (let x = 0; x < width; x++) {
      const xMin = Math.max(0, x - halfBlock);
      const xMax = Math.min(width - 1, x + halfBlock);

      let sum = 0;
      let count = 0;
      let localMin = 255;
      let localMax = 0;
      const step = 2;
      for (let sy = yMin; sy <= yMax; sy += step) {
        for (let sx = xMin; sx <= xMax; sx += step) {
          const v = gray[sy * width + sx];
          sum += v;
          count++;
          if (v < localMin) localMin = v;
          if (v > localMax) localMax = v;
        }
      }

      let threshold = globalThreshold;
      if (localMax - localMin > 24) {
        threshold = sum / count - 3;
      }
      binary[y * width + x] = gray[y * width + x] < threshold ? 1 : 0;
    }
  }

  return binary;
}

interface Point {
  x: number;
  y: number;
  size: number;
}

function findFinderPatternCenters(bin: Uint8Array, width: number, height: number): Point[] {
  const centers: Point[] = [];
  const stateCount = [0, 0, 0, 0, 0];

  for (let y = 0; y < height; y++) {
    stateCount.fill(0);
    let currentState = 0;

    for (let x = 0; x < width; x++) {
      const pixel = bin[y * width + x];
      if (pixel === 1) {
        if ((currentState & 1) === 1) currentState++;
        stateCount[currentState]++;
      } else {
        if ((currentState & 1) === 0) {
          if (currentState === 4) {
            if (checkRatio(stateCount)) {
              const cx = x - stateCount[4] - stateCount[3] - stateCount[2] / 2;
              const vCenter = crossCheckVertical(bin, width, height, Math.round(cx), y, stateCount[2]);
              if (vCenter) {
                const hCenter = crossCheckHorizontal(
                  bin,
                  width,
                  height,
                  Math.round(cx),
                  Math.round(vCenter.y),
                  stateCount[2],
                );
                if (hCenter && Math.abs(hCenter.size - vCenter.size) < vCenter.size * 0.25) {
                  const finalCenter: Point = {
                    x: hCenter.x,
                    y: vCenter.y,
                    size: (hCenter.size + vCenter.size) / 2,
                  };
                  const existing = centers.find((c) => Math.hypot(c.x - finalCenter.x, c.y - finalCenter.y) < 10);
                  if (!existing) centers.push(finalCenter);
                }
              }
            }
            stateCount[0] = stateCount[2];
            stateCount[1] = stateCount[3];
            stateCount[2] = stateCount[4];
            stateCount[3] = 1;
            stateCount[4] = 0;
            currentState = 3;
            continue;
          } else {
            currentState++;
          }
        }
        stateCount[currentState]++;
      }
    }
  }

  return centers;
}

function checkRatio(stateCount: number[]): boolean {
  const total = stateCount.reduce((a, b) => a + b, 0);
  if (total < 7) return false;
  const moduleSize = total / 7;
  const maxVariance = moduleSize / 2;
  return (
    Math.abs(moduleSize - stateCount[0]) < maxVariance &&
    Math.abs(moduleSize - stateCount[1]) < maxVariance &&
    Math.abs(3 * moduleSize - stateCount[2]) < 3 * maxVariance &&
    Math.abs(moduleSize - stateCount[3]) < maxVariance &&
    Math.abs(moduleSize - stateCount[4]) < maxVariance
  );
}

function crossCheckVertical(
  bin: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  maxCount: number,
): Point | null {
  const stateCount = [0, 0, 0, 0, 0];
  let y = startY;
  while (y >= 0 && bin[y * width + startX] === 1) { stateCount[2]++; y--; }
  if (y < 0) return null;
  while (y >= 0 && bin[y * width + startX] === 0 && stateCount[1] <= maxCount) { stateCount[1]++; y--; }
  if (y < 0 || stateCount[1] > maxCount) return null;
  while (y >= 0 && bin[y * width + startX] === 1 && stateCount[0] <= maxCount) { stateCount[0]++; y--; }
  if (y < 0 || stateCount[0] > maxCount) return null;

  y = startY + 1;
  while (y < height && bin[y * width + startX] === 1) { stateCount[2]++; y++; }
  if (y >= height) return null;
  while (y < height && bin[y * width + startX] === 0 && stateCount[3] <= maxCount) { stateCount[3]++; y++; }
  if (y >= height || stateCount[3] > maxCount) return null;
  while (y < height && bin[y * width + startX] === 1 && stateCount[4] <= maxCount) { stateCount[4]++; y++; }
  if (y >= height || stateCount[4] > maxCount) return null;

  if (checkRatio(stateCount)) {
    const cy = y - stateCount[4] - stateCount[3] - stateCount[2] / 2;
    const total = stateCount.reduce((a, b) => a + b, 0);
    return { x: startX, y: cy, size: total / 7 };
  }
  return null;
}

function crossCheckHorizontal(
  bin: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  maxCount: number,
): Point | null {
  const stateCount = [0, 0, 0, 0, 0];
  let x = startX;
  while (x >= 0 && bin[startY * width + x] === 1) { stateCount[2]++; x--; }
  if (x < 0) return null;
  while (x >= 0 && bin[startY * width + x] === 0 && stateCount[1] <= maxCount) { stateCount[1]++; x--; }
  if (x < 0 || stateCount[1] > maxCount) return null;
  while (x >= 0 && bin[startY * width + x] === 1 && stateCount[0] <= maxCount) { stateCount[0]++; x--; }
  if (x < 0 || stateCount[0] > maxCount) return null;

  x = startX + 1;
  while (x < width && bin[startY * width + x] === 1) { stateCount[2]++; x++; }
  if (x >= width) return null;
  while (x < width && bin[startY * width + x] === 0 && stateCount[3] <= maxCount) { stateCount[3]++; x++; }
  if (x >= width || stateCount[3] > maxCount) return null;
  while (x < width && bin[startY * width + x] === 1 && stateCount[4] <= maxCount) { stateCount[4]++; x++; }
  if (x >= width || stateCount[4] > maxCount) return null;

  if (checkRatio(stateCount)) {
    const cx = x - stateCount[4] - stateCount[3] - stateCount[2] / 2;
    const total = stateCount.reduce((a, b) => a + b, 0);
    return { x: cx, y: startY, size: total / 7 };
  }
  return null;
}

interface TripletCandidate {
  tl: Point;
  tr: Point;
  bl: Point;
  score: number;
}

function decodeWithFinderPatterns(
  bin: Uint8Array,
  width: number,
  height: number,
  centers: Point[],
): QrDecodeResult | null {
  if (centers.length < 3) return null;

  const triplets: TripletCandidate[] = [];

  for (let i = 0; i < centers.length - 2; i++) {
    for (let j = i + 1; j < centers.length - 1; j++) {
      for (let k = j + 1; k < centers.length; k++) {
        const p1 = centers[i];
        const p2 = centers[j];
        const p3 = centers[k];

        const d12 = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const d23 = Math.hypot(p2.x - p3.x, p2.y - p3.y);
        const d13 = Math.hypot(p1.x - p3.x, p1.y - p3.y);

        const dists = [
          { d: d12, pair: [p1, p2], opposite: p3 },
          { d: d23, pair: [p2, p3], opposite: p1 },
          { d: d13, pair: [p1, p3], opposite: p2 },
        ].sort((a, b) => a.d - b.d);

        const dMin1 = dists[0].d;
        const dMin2 = dists[1].d;
        const dHyp = dists[2].d;
        const tl = dists[2].opposite;

        const pA = dists[2].pair[0];
        const pB = dists[2].pair[1];

        let tr: Point, bl: Point;
        if (crossProduct(tl, pA, pB) > 0) {
          tr = pA;
          bl = pB;
        } else {
          tr = pB;
          bl = pA;
        }

        const rightAngleScore = Math.abs(dMin1 - dMin2) / dMin1 + Math.abs(dHyp / (dMin1 * Math.SQRT2) - 1);
        triplets.push({ tl, tr, bl, score: rightAngleScore });
      }
    }
  }

  triplets.sort((a, b) => a.score - b.score);

  for (const { tl, tr, bl } of triplets) {
    const avgModuleSize = (tl.size + tr.size + bl.size) / 3;
    const distTL_TR = Math.hypot(tl.x - tr.x, tl.y - tr.y);
    const estDimension = Math.round(distTL_TR / avgModuleSize) + 7;
    const version = Math.max(1, Math.min(40, Math.round((estDimension - 17) / 4)));
    const moduleCount = version * 4 + 17;

    const matrix = sampleGrid(bin, width, height, tl, tr, bl, moduleCount);
    if (matrix) {
      const res = decodeMatrix(matrix, version);
      if (res) return res;
    }
  }

  return null;
}

function crossProduct(p1: Point, p2: Point, p3: Point): number {
  return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
}

function sampleGrid(
  bin: Uint8Array,
  imgWidth: number,
  imgHeight: number,
  tl: Point,
  tr: Point,
  bl: Point,
  size: number,
): boolean[][] | null {
  const brX = tr.x + bl.x - tl.x;
  const brY = tr.y + bl.y - tl.y;

  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const span = size - 7;
  if (span <= 0) return null;

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5 - 3.5) / span;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5 - 3.5) / span;
      const px = Math.round((1 - u) * (1 - v) * tl.x + u * (1 - v) * tr.x + (1 - u) * v * bl.x + u * v * brX);
      const py = Math.round((1 - u) * (1 - v) * tl.y + u * (1 - v) * tr.y + (1 - u) * v * bl.y + u * v * brY);

      if (px >= 0 && px < imgWidth && py >= 0 && py < imgHeight) {
        matrix[y][x] = bin[py * imgWidth + px] === 1;
      }
    }
  }

  return matrix;
}

function decodeMatrix(matrix: boolean[][], version: number): QrDecodeResult | null {
  const size = matrix.length;

  // Read format bits (15 bits)
  let formatBits = 0;
  for (let i = 0; i <= 5; i++) {
    if (matrix[i][8]) formatBits |= 1 << i;
  }
  if (matrix[7][8]) formatBits |= 1 << 6;
  if (matrix[8][8]) formatBits |= 1 << 7;
  if (matrix[8][7]) formatBits |= 1 << 8;
  for (let i = 9; i < 15; i++) {
    if (matrix[8][14 - i]) formatBits |= 1 << i;
  }

  formatBits ^= 0x5412; // Unmask format pattern
  const data = (formatBits >>> 10) & 0x1f;
  const mask = data & 7;
  const eclIdx = (data >>> 3) ^ 1;

  // Unmask grid
  const unmasked = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      let inv = false;
      switch (mask) {
        case 0: inv = (x + y) % 2 === 0; break;
        case 1: inv = y % 2 === 0; break;
        case 2: inv = x % 3 === 0; break;
        case 3: inv = (x + y) % 3 === 0; break;
        case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: inv = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        case 7: inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
      }
      return inv ? !matrix[y][x] : matrix[y][x];
    }),
  );

  const isFunc = getFunctionMask(version, size);

  // Read raw bits into codewords
  const bits: number[] = [];
  let right = size - 1;
  while (right >= 1) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunc[y][x]) {
          bits.push(unmasked[y][x] ? 1 : 0);
        }
      }
    }
    right -= 2;
  }

  // Convert bits to raw bytes
  const rawBytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < rawBytes.length; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
    rawBytes[i] = b;
  }

  // De-interleave blocks
  const dataBytes = deinterleave(rawBytes, version, eclIdx);
  if (!dataBytes) return null;

  // Convert dataBytes back to bit array for parseBitStream
  const dataBits: number[] = [];
  for (const b of dataBytes) {
    for (let j = 7; j >= 0; j--) {
      dataBits.push((b >>> j) & 1);
    }
  }

  try {
    const text = parseBitStream(dataBits, version);
    if (text !== null) {
      return { text, binaryData: dataBytes, version };
    }
  } catch {
    return null;
  }

  return null;
}

const NUM_ERROR_CORRECTION_BLOCKS: number[][] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25], // L
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49], // M
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68], // Q
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81], // H
];

const ECC_CODEWORDS_PER_BLOCK: number[][] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // L
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], // M
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // Q
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // H
];

function deinterleave(rawBytes: Uint8Array, version: number, eclIdx: number): Uint8Array | null {
  const safeEcl = eclIdx >= 0 && eclIdx <= 3 ? eclIdx : 1;
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[safeEcl][version];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[safeEcl][version];
  if (!numBlocks || !blockEccLen) return rawBytes;

  const rawCodewords = rawBytes.length;
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blockDataLens: number[] = [];
  for (let i = 0; i < numBlocks; i++) {
    blockDataLens.push(shortBlockLen - blockEccLen + (i >= numShortBlocks ? 1 : 0));
  }

  const dataBlocks: number[][] = Array.from({ length: numBlocks }, () => []);
  let rawIdx = 0;

  const maxDataLen = Math.max(...blockDataLens);
  for (let i = 0; i < maxDataLen; i++) {
    for (let j = 0; j < numBlocks; j++) {
      if (i < blockDataLens[j] && rawIdx < rawCodewords) {
        dataBlocks[j].push(rawBytes[rawIdx++]);
      }
    }
  }

  const totalDataBytes = blockDataLens.reduce((a, b) => a + b, 0);
  const result = new Uint8Array(totalDataBytes);
  let outIdx = 0;
  for (let j = 0; j < numBlocks; j++) {
    for (const b of dataBlocks[j]) {
      result[outIdx++] = b;
    }
  }

  return result;
}

function getFunctionMask(version: number, size: number): boolean[][] {
  const isFunc = Array.from({ length: size }, () => Array(size).fill(false));
  // Timing
  for (let i = 0; i < size; i++) {
    isFunc[6][i] = true;
    isFunc[i][6] = true;
  }
  // Finder 1
  for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) isFunc[y][x] = true;
  // Finder 2
  for (let y = 0; y <= 8; y++) for (let x = size - 8; x < size; x++) isFunc[y][x] = true;
  // Finder 3
  for (let y = size - 8; y < size; y++) for (let x = 0; x <= 8; x++) isFunc[y][x] = true;

  // Dark module
  isFunc[size - 8][8] = true;

  // Alignments
  if (version >= 2) {
    const alignPos = getAlignPositions(version);
    for (const ay of alignPos) {
      for (const ax of alignPos) {
        if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (ay + dy >= 0 && ay + dy < size && ax + dx >= 0 && ax + dx < size) {
              isFunc[ay + dy][ax + dx] = true;
            }
          }
        }
      }
    }
  }

  // Version info
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        isFunc[i][size - 11 + j] = true;
        isFunc[size - 11 + j][i] = true;
      }
    }
  }

  return isFunc;
}

function getAlignPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result: number[] = [6];
  for (let pos = version * 4 + 10; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

function parseBitStream(bits: number[], version: number): string | null {
  let bitIdx = 0;
  const readBits = (n: number): number => {
    let val = 0;
    for (let i = 0; i < n; i++) {
      if (bitIdx < bits.length) {
        val = (val << 1) | bits[bitIdx++];
      }
    }
    return val;
  };

  const ALPHANUMERIC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  const outBytes: number[] = [];

  while (bitIdx <= bits.length - 4) {
    const mode = readBits(4);
    if (mode === 0) break; // Terminator

    if (mode === 0x1) {
      // Numeric
      const countBits = version < 10 ? 10 : version < 27 ? 12 : 14;
      let count = readBits(countBits);
      while (count >= 3) {
        const val = readBits(10);
        const str = val.toString().padStart(3, '0');
        for (let i = 0; i < 3; i++) outBytes.push(str.charCodeAt(i));
        count -= 3;
      }
      if (count === 2) {
        const val = readBits(7);
        const str = val.toString().padStart(2, '0');
        for (let i = 0; i < 2; i++) outBytes.push(str.charCodeAt(i));
      } else if (count === 1) {
        const val = readBits(4);
        outBytes.push(val.toString().charCodeAt(0));
      }
    } else if (mode === 0x2) {
      // Alphanumeric
      const countBits = version < 10 ? 9 : version < 27 ? 11 : 13;
      let count = readBits(countBits);
      while (count >= 2) {
        const val = readBits(11);
        outBytes.push(ALPHANUMERIC_CHARS.charCodeAt(Math.floor(val / 45)));
        outBytes.push(ALPHANUMERIC_CHARS.charCodeAt(val % 45));
        count -= 2;
      }
      if (count === 1) {
        const val = readBits(6);
        outBytes.push(ALPHANUMERIC_CHARS.charCodeAt(val));
      }
    } else if (mode === 0x4) {
      // Byte mode
      const countBits = version < 10 ? 8 : 16;
      const count = readBits(countBits);
      for (let i = 0; i < count; i++) {
        outBytes.push(readBits(8));
      }
    } else {
      break;
    }
  }

  if (outBytes.length === 0) return null;
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(new Uint8Array(outBytes));
}
