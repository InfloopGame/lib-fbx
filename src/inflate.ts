/**
 * Zlib 解压缩（FBX 二进制数组属性）
 * 剥离 2 字节 zlib 头与 4 字节 Adler32，再解 raw deflate
 */
import { FbxError } from './util'

/** 调试用 recorder：非 undefined 时会记录每次 inflate 的 input/output，供 scripts/verify-inflate.ts 三方对比。 */
export let inflateRecorder: Array<{ input: Uint8Array; output: Uint8Array }> | undefined

export function setInflateRecorder(rec: Array<{ input: Uint8Array; output: Uint8Array }> | undefined): void {
  inflateRecorder = rec
}

export function inflate(data: Uint8Array): Uint8Array {
  if (data.length < 6) {
    throw new FbxError('INVALID_DATA', 'inflate: input too short')
  }

  const cmf = data[0] ?? 0
  const method = cmf & 0x0f
  if (method !== 8) {
    throw new FbxError('INVALID_DATA', 'inflate: unsupported compression method')
  }

  const output = inflateRaw(data.subarray(2, data.length - 4))
  if (inflateRecorder) inflateRecorder.push({ input: data, output })
  return output
}

function inflateRaw(input: Uint8Array): Uint8Array {
  let inputPos = 0
  let bitBuf = 0
  let bitCount = 0

  // 输出用 growable Uint8Array 而非 number[]：
  //   1. number[] push 会让 V8 hidden class 在 SMI/DOUBLE 间反复切换，且底层是 boxed 存储
  //   2. LZ77 back-reference 大段拷贝用 typed array 可以走 memcpy（copyWithin）
  //   3. 最后不用再 new Uint8Array(numArray) 逐元素拷贝
  // 初始容量：deflate 常见 2-5x 压缩比，用 2x input 起步减少 grow 次数
  let out = new Uint8Array(Math.max(4096, input.length * 2))
  let outLen = 0

  function ensureCap(min: number): void {
    if (min <= out.length) return
    let cap = out.length
    while (cap < min) cap *= 2
    const next = new Uint8Array(cap)
    next.set(out.subarray(0, outLen))
    out = next
  }

  function pushByte(b: number): void {
    if (outLen >= out.length) ensureCap(outLen + 1)
    out[outLen++] = b
  }

  function readBits(n: number): number {
    while (bitCount < n) {
      if (inputPos >= input.length) {
        throw new FbxError('INVALID_DATA', 'inflate: unexpected end')
      }
      bitBuf |= (input[inputPos++] ?? 0) << bitCount
      bitCount += 8
    }
    const val = bitBuf & ((1 << n) - 1)
    bitBuf >>>= n
    bitCount -= n
    return val
  }

  function buildHuffmanTable(
    lengths: Uint8Array,
    maxSymbol: number,
  ): { blCount: number[]; symbols: number[] } {
    const maxLen = Math.max(0, ...lengths)
    const blCount = new Array<number>(maxLen + 1).fill(0)
    for (let i = 0; i <= maxSymbol; i++) {
      const len = lengths[i] ?? 0
      if (len) blCount[len] = (blCount[len] ?? 0) + 1
    }

    const symbols: number[] = []
    const bc: number[] = new Array<number>(maxLen + 1).fill(0)

    for (let bits = 1; bits <= maxLen; bits++) {
      for (let sym = 0; sym <= maxSymbol; sym++) {
        if (lengths[sym] === bits) {
          symbols.push(sym)
          bc[bits] = (bc[bits] ?? 0) + 1
        }
      }
    }

    return { blCount: bc, symbols }
  }

  const fixedLitLengths = new Uint8Array(288)
  for (let i = 0; i <= 143; i++) fixedLitLengths[i] = 8
  for (let i = 144; i <= 255; i++) fixedLitLengths[i] = 9
  for (let i = 256; i <= 279; i++) fixedLitLengths[i] = 7
  for (let i = 280; i <= 287; i++) fixedLitLengths[i] = 8

  const fixedDistLengths = new Uint8Array(32)
  fixedDistLengths.fill(5)

  const fixedLitTable = buildHuffmanTable(fixedLitLengths, 287)
  const fixedDistTable = buildHuffmanTable(fixedDistLengths, 31)

  const lengthBase = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
    163, 195, 227, 258,
  ]
  const lengthExtra = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
  const distBase = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
    3073, 4097, 6145, 8193, 12289, 16385, 24577,
  ]
  const distExtra = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
  const codeLengthOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

  function readHuffmanSym(table: { blCount: number[]; symbols: number[] }): number {
    let code = 0
    let first = 0
    let index = 0
    const maxBits = table.blCount.length - 1

    for (let len = 1; len <= maxBits; len++) {
      code |= readBits(1)
      const count = table.blCount[len] ?? 0
      if (code - count < first) {
        return table.symbols[index + (code - first)] ?? 0
      }
      index += count
      first = (first + count) << 1
      code <<= 1
    }
    throw new FbxError('INVALID_DATA', 'inflate: invalid huffman code')
  }

  function decodeBlock(
    litTable: { blCount: number[]; symbols: number[] },
    distTable: { blCount: number[]; symbols: number[] },
  ): void {
    while (true) {
      const sym = readHuffmanSym(litTable)

      if (sym < 256) {
        pushByte(sym)
      } else if (sym === 256) {
        return
      } else {
        const lenIdx = sym - 257
        const length = (lengthBase[lenIdx] ?? 0) + readBits(lengthExtra[lenIdx] ?? 0)
        const distSym = readHuffmanSym(distTable)
        const distance = (distBase[distSym] ?? 0) + readBits(distExtra[distSym] ?? 0)

        ensureCap(outLen + length)
        const start = outLen - distance
        // 关键：DEFLATE 允许 distance < length（重叠拷贝，用来表达"重复 N 次"模式，
        // 如 distance=1 length=100 表示重复上一字节 100 次）。copyWithin 底层是 memmove，
        // 遇到 overlap 会用错方向的拷贝，破坏语义。所以只有 distance >= length 才能用。
        if (distance >= length) {
          out.copyWithin(outLen, start, start + length)
        } else {
          for (let i = 0; i < length; i++) out[outLen + i] = out[start + i] as number
        }
        outLen += length
      }
    }
  }

  let bfinal = 0
  while (!bfinal) {
    bfinal = readBits(1)
    const btype = readBits(2)

    if (btype === 0) {
      bitBuf = 0
      bitCount = 0
      const len = (input[inputPos] ?? 0) | ((input[inputPos + 1] ?? 0) << 8)
      inputPos += 4
      // stored block：一次性 set() 而不是逐字节 push
      ensureCap(outLen + len)
      out.set(input.subarray(inputPos, inputPos + len), outLen)
      outLen += len
      inputPos += len
    } else if (btype === 1) {
      decodeBlock(fixedLitTable, fixedDistTable)
    } else if (btype === 2) {
      const hlit = readBits(5) + 257
      const hdist = readBits(5) + 1
      const hclen = readBits(4) + 4

      const codeLengths = new Uint8Array(19)
      for (let i = 0; i < hclen; i++) {
        const order = codeLengthOrder[i] ?? 0
        codeLengths[order] = readBits(3)
      }

      const clTable = buildHuffmanTable(codeLengths, 18)
      const totalCodes = hlit + hdist
      const allLengths = new Uint8Array(totalCodes)
      let idx = 0

      while (idx < totalCodes) {
        const sym = readHuffmanSym(clTable)

        if (sym < 16) {
          allLengths[idx++] = sym
        } else if (sym === 16) {
          const repeat = readBits(2) + 3
          const prev = allLengths[idx - 1] ?? 0
          for (let i = 0; i < repeat; i++) allLengths[idx++] = prev
        } else if (sym === 17) {
          const repeat = readBits(3) + 3
          for (let i = 0; i < repeat; i++) allLengths[idx++] = 0
        } else {
          const repeat = readBits(7) + 11
          for (let i = 0; i < repeat; i++) allLengths[idx++] = 0
        }
      }

      const litLengths = allLengths.subarray(0, hlit)
      const distLengths = allLengths.subarray(hlit)
      decodeBlock(buildHuffmanTable(litLengths, hlit - 1), buildHuffmanTable(distLengths, hdist - 1))
    } else {
      throw new FbxError('INVALID_DATA', 'inflate: invalid block type')
    }
  }

  // slice() 返回刚好大小的独立 buffer，避免 subarray 持有整个（可能很大的）容量 buffer 造成 leak
  return out.slice(0, outLen)
}
