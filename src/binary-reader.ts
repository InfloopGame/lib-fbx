/**
 * FBX 二进制底层读取器
 * 封装 DataView，提供逐类型顺序读取能力
 *
 * 数字数组约定：所有 int32 / int64 / float32 / float64 数组统一返回 `Float64Array`。
 * int64 遵循 JavaScript number 的 2^53 精度限制。
 */

/**
 * 宿主字节序 —— 几乎所有目标平台（x86 / ARM / WASM）都是小端。
 * 数组读取的快路径需要 host 与流字节序一致，否则每个元素得 DataView 转换。
 */
const HOST_LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1

export class BinaryReader {
  private dv: DataView
  private offset = 0
  private littleEndian: boolean
  private decoder = new TextDecoder()

  constructor(buffer: ArrayBuffer | Uint8Array, littleEndian = true) {
    if (buffer instanceof Uint8Array) {
      this.dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    } else {
      this.dv = new DataView(buffer)
    }
    this.littleEndian = littleEndian
  }

  getOffset(): number {
    return this.offset
  }

  size(): number {
    return this.dv.byteLength
  }

  skip(length: number): void {
    this.offset += length
  }

  getBoolean(): boolean {
    return (this.getUint8() & 1) === 1
  }

  getBooleanArray(size: number): boolean[] {
    const a = new Array<boolean>(size)
    for (let i = 0; i < size; i++) a[i] = this.getBoolean()
    return a
  }

  getUint8(): number {
    const value = this.dv.getUint8(this.offset)
    this.offset += 1
    return value
  }

  getInt16(): number {
    const value = this.dv.getInt16(this.offset, this.littleEndian)
    this.offset += 2
    return value
  }

  getInt32(): number {
    const value = this.dv.getInt32(this.offset, this.littleEndian)
    this.offset += 4
    return value
  }

  getInt32Array(size: number): Float64Array {
    if (size === 0) return new Float64Array(0)
    if (this.littleEndian && HOST_LITTLE_ENDIAN) {
      const byteLen = size * 4
      const start = this.dv.byteOffset + this.offset
      // slice 一次 memcpy 到独立 buffer（Int32Array 要求 4B 对齐，slice 后 offset=0 天然满足）。
      // new Float64Array(typedArray) 是 V8 内建 fast path：一次批量元素转换 (int32 → double)。
      const buf = this.dv.buffer.slice(start, start + byteLen)
      this.offset += byteLen
      return new Float64Array(new Int32Array(buf))
    }
    const a = new Float64Array(size)
    for (let i = 0; i < size; i++) a[i] = this.getInt32()
    return a
  }

  getUint32(): number {
    const value = this.dv.getUint32(this.offset, this.littleEndian)
    this.offset += 4
    return value
  }

  getInt64(): number {
    let low: number
    let high: number

    if (this.littleEndian) {
      low = this.getUint32()
      high = this.getUint32()
    } else {
      high = this.getUint32()
      low = this.getUint32()
    }

    if (high & 0x80000000) {
      // 两位补码：先按位取反再 +1，然后加负号。
      // 关键：JS 位运算 `& 0xffffffff` 返回 signed int32（-2^31 ~ 2^31-1），
      // 若结果高位 set 会得到负数，后续 `-(hi*2^32 + lo)` 会翻转符号。
      // 用 `>>> 0` 强制转 uint32，保证算术全程 unsigned。
      high = (~high & 0xffffffff) >>> 0
      low = (~low & 0xffffffff) >>> 0
      if (low === 0xffffffff) high = ((high + 1) & 0xffffffff) >>> 0
      low = ((low + 1) & 0xffffffff) >>> 0
      return -(high * 0x100000000 + low)
    }

    return high * 0x100000000 + low
  }

  getInt64Array(size: number): Float64Array {
    if (size === 0) return new Float64Array(0)
    if (this.littleEndian && HOST_LITTLE_ENDIAN) {
      const byteLen = size * 8
      const start = this.dv.byteOffset + this.offset
      const buf = this.dv.buffer.slice(start, start + byteLen)
      this.offset += byteLen
      // 用 Uint32Array 视图批量读 low/high pair，比 N 次 getUint32 少 offset 递增和边界检查。
      // 不用 BigInt64Array + Number()：BigInt→Number 转换在 V8 里比手写位运算慢。
      const view = new Uint32Array(buf)
      const a = new Float64Array(size)
      for (let i = 0; i < size; i++) {
        const lo = view[i * 2] as number
        let hi = view[i * 2 + 1] as number
        if (hi & 0x80000000) {
          hi = (~hi & 0xffffffff) >>> 0
          let neg = (~lo & 0xffffffff) >>> 0
          if (neg === 0xffffffff) hi = ((hi + 1) & 0xffffffff) >>> 0
          neg = ((neg + 1) & 0xffffffff) >>> 0
          a[i] = -(hi * 0x100000000 + neg)
        } else {
          a[i] = hi * 0x100000000 + lo
        }
      }
      return a
    }
    const a = new Float64Array(size)
    for (let i = 0; i < size; i++) a[i] = this.getInt64()
    return a
  }

  getUint64(): number {
    let low: number
    let high: number

    if (this.littleEndian) {
      low = this.getUint32()
      high = this.getUint32()
    } else {
      high = this.getUint32()
      low = this.getUint32()
    }

    return high * 0x100000000 + low
  }

  getFloat32(): number {
    const value = this.dv.getFloat32(this.offset, this.littleEndian)
    this.offset += 4
    return value
  }

  getFloat32Array(size: number): Float64Array {
    if (size === 0) return new Float64Array(0)
    if (this.littleEndian && HOST_LITTLE_ENDIAN) {
      const byteLen = size * 4
      const start = this.dv.byteOffset + this.offset
      const buf = this.dv.buffer.slice(start, start + byteLen)
      this.offset += byteLen
      // Float32Array → Float64Array 是隐式扩位（V8 内建 fast path）
      return new Float64Array(new Float32Array(buf))
    }
    const a = new Float64Array(size)
    for (let i = 0; i < size; i++) a[i] = this.getFloat32()
    return a
  }

  getFloat64(): number {
    const value = this.dv.getFloat64(this.offset, this.littleEndian)
    this.offset += 8
    return value
  }

  getFloat64Array(size: number): Float64Array {
    if (size === 0) return new Float64Array(0)
    if (this.littleEndian && HOST_LITTLE_ENDIAN) {
      const byteLen = size * 8
      const start = this.dv.byteOffset + this.offset
      // slice 保证 8 字节对齐 + 一次 memcpy，直接把新 buffer 交给 Float64Array 视图
      const buf = this.dv.buffer.slice(start, start + byteLen)
      this.offset += byteLen
      return new Float64Array(buf)
    }
    const a = new Float64Array(size)
    for (let i = 0; i < size; i++) a[i] = this.getFloat64()
    return a
  }

  getArrayBuffer(size: number): ArrayBuffer {
    const start = this.dv.byteOffset + this.offset
    const value = this.dv.buffer.slice(start, start + size) as ArrayBuffer
    this.offset += size
    return value
  }

  getString(size: number): string {
    const start = this.dv.byteOffset + this.offset
    let a = new Uint8Array(this.dv.buffer, start, size)
    this.skip(size)

    const nullByte = a.indexOf(0)
    if (nullByte >= 0) a = new Uint8Array(this.dv.buffer, start, nullByte)

    return this.decoder.decode(a)
  }
}
