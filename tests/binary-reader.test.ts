import { describe, expect, it } from 'vitest'
import { BinaryReader } from '../src/binary-reader'
import { inflate, setInflateRecorder } from '../src/inflate'
import { FbxError } from '../src/util'
import { deflateSync } from 'node:zlib'

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values)
}

/** 生成 8 字节的 little-endian i64 表示。 */
function i64Le(value: bigint): Uint8Array {
  const buf = new ArrayBuffer(8)
  new DataView(buf).setBigInt64(0, value, true)
  return new Uint8Array(buf)
}

describe('BinaryReader.getInt64', () => {
  it('reads zero', () => {
    const r = new BinaryReader(i64Le(0n))
    expect(r.getInt64()).toBe(0)
  })

  it('reads small positive', () => {
    const r = new BinaryReader(i64Le(1234567890n))
    expect(r.getInt64()).toBe(1234567890)
  })

  it('reads -1 (all 0xFF)', () => {
    const r = new BinaryReader(i64Le(-1n))
    expect(r.getInt64()).toBe(-1)
  })

  it('reads INT32_MIN (-2^31)', () => {
    const r = new BinaryReader(i64Le(-2147483648n))
    expect(r.getInt64()).toBe(-2147483648)
  })

  it('reads -2^32 (edge of high-word carry)', () => {
    const r = new BinaryReader(i64Le(-4294967296n))
    expect(r.getInt64()).toBe(-4294967296)
  })

  // 这是历史 bug：当值落在 `-2^32 < v < -2^31` 时，`hi = 0xFFFFFFFF` 且
  // `lo` 高位 set。旧算法里 `~lo & 0xffffffff` 在 JS 位运算下会返回负 int32，
  // 后续 `-(hi * 2^32 + lo)` 会翻转符号，把大负值错读成正值（差恰好 2^32）。
  // 现在算法里加了 `>>> 0` 强制转 uint32。
  it('reads value between -2^32 and -2^31 (regression: signed int32 overflow bug)', () => {
    const r = new BinaryReader(i64Le(-2309307900n))
    expect(r.getInt64()).toBe(-2309307900)
  })

  it('reads another value in the historical bug range', () => {
    const r = new BinaryReader(i64Le(-3079077200n))
    expect(r.getInt64()).toBe(-3079077200)
  })

  it('reads large positive requiring high word', () => {
    // 40 000 000 000 = 约 1 秒的 FBX KTime 单位
    const r = new BinaryReader(i64Le(40000000000n))
    expect(r.getInt64()).toBe(40000000000)
  })

  it('reads more large negative (multi-second KTime)', () => {
    const r = new BinaryReader(i64Le(-72681962704n))
    expect(r.getInt64()).toBe(-72681962704)
  })

  it('big-endian mode reads correctly', () => {
    const buf = new ArrayBuffer(8)
    new DataView(buf).setBigInt64(0, -2309307900n, false)
    const r = new BinaryReader(new Uint8Array(buf), false)
    expect(r.getInt64()).toBe(-2309307900)
  })
})

describe('BinaryReader basic ops', () => {
  it('reads u8 / i16 / u32 / i32', () => {
    const r = new BinaryReader(bytes(0xff, 0x01, 0x80, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x80))
    expect(r.getUint8()).toBe(0xff)
    expect(r.getInt16()).toBe(-32767)
    expect(r.getUint32()).toBe(0xffffffff)
    expect(r.getInt32()).toBe(-2147483648)
  })

  it('reads f32 / f64', () => {
    const buf = new ArrayBuffer(12)
    const dv = new DataView(buf)
    dv.setFloat32(0, 1.5, true)
    dv.setFloat64(4, -3.14, true)
    const r = new BinaryReader(new Uint8Array(buf))
    expect(r.getFloat32()).toBe(1.5)
    expect(r.getFloat64()).toBe(-3.14)
  })

  it('getString stops at null byte and utf-8 decodes', () => {
    const r = new BinaryReader(bytes(0x68, 0x69, 0x00, 0x21))
    expect(r.getString(4)).toBe('hi')
  })

  it('getUint64 handles values above 2^32', () => {
    const buf = new ArrayBuffer(8)
    new DataView(buf).setBigUint64(0, 40000000000n, true)
    const r = new BinaryReader(new Uint8Array(buf))
    expect(r.getUint64()).toBe(40000000000)
  })

  it('boolean array reads low bit', () => {
    const r = new BinaryReader(bytes(0x00, 0x01, 0x02, 0x03))
    expect(r.getBooleanArray(4)).toEqual([false, true, false, true])
  })

  it('int32/int64/float arrays', () => {
    const buf = new ArrayBuffer(28)
    const dv = new DataView(buf)
    dv.setInt32(0, 1, true)
    dv.setInt32(4, -1, true)
    dv.setBigInt64(8, -2309307900n, true)
    dv.setFloat32(16, 1.5, true)
    dv.setFloat64(20, 3.5, true)
    const r = new BinaryReader(new Uint8Array(buf))
    // 数字数组统一 Float64Array（触发 binary-reader 的 slice+typed-array 快路径）
    expect(r.getInt32Array(2)).toEqual(new Float64Array([1, -1]))
    expect(r.getInt64Array(1)).toEqual(new Float64Array([-2309307900]))
    expect(r.getFloat32Array(1)).toEqual(new Float64Array([1.5]))
    expect(r.getFloat64Array(1)).toEqual(new Float64Array([3.5]))
  })

  it('empty arrays return an empty Float64Array without advancing offset', () => {
    const r = new BinaryReader(new Uint8Array(8))
    expect(r.getInt32Array(0)).toEqual(new Float64Array(0))
    expect(r.getInt64Array(0)).toEqual(new Float64Array(0))
    expect(r.getFloat32Array(0)).toEqual(new Float64Array(0))
    expect(r.getFloat64Array(0)).toEqual(new Float64Array(0))
    expect(r.getOffset()).toBe(0)
  })

  // BE fallback 路径：手写 littleEndian=false 覆盖 slice+typed-array 快路径以外的分支（fallback 逐元素读）。
  // 走的仍是修好的 getInt64 位运算，负值也应正确。
  it('big-endian arrays fall back to per-element reads', () => {
    const buf = new ArrayBuffer(28)
    const dv = new DataView(buf)
    dv.setInt32(0, 1, false)
    dv.setInt32(4, -1, false)
    dv.setBigInt64(8, -2309307900n, false)
    dv.setFloat32(16, 1.5, false)
    dv.setFloat64(20, 3.5, false)
    const r = new BinaryReader(new Uint8Array(buf), false)
    expect(r.getInt32Array(2)).toEqual(new Float64Array([1, -1]))
    expect(r.getInt64Array(1)).toEqual(new Float64Array([-2309307900]))
    expect(r.getFloat32Array(1)).toEqual(new Float64Array([1.5]))
    expect(r.getFloat64Array(1)).toEqual(new Float64Array([3.5]))
  })
})

describe('inflate', () => {
  it('rejects too-short input', () => {
    expect(() => inflate(new Uint8Array(3))).toThrow(/input too short/)
  })

  it('rejects non-deflate compression method (CMF low nibble != 8)', () => {
    // 6 字节最小长度；CMF=0x00 → method=0，触发 unsupported
    expect(() => inflate(new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))).toThrow(
      /unsupported compression method/,
    )
  })

  it('wraps fflate errors as INVALID_DATA', () => {
    // 合法 zlib 头 + 合法尾长度，但中间 payload 是截断的动态 Huffman block，fflate 会抛 "invalid X"
    const full = deflateSync(Buffer.alloc(4096, 0x41)) // 大 payload 保证走动态块
    // 只保留头 2B + 前 4B payload + 4B fake adler，凑够 length >= 6 且触发解码失败
    const truncated = new Uint8Array(10)
    truncated.set(full.subarray(0, 6))
    let threw = false
    try {
      inflate(truncated)
    } catch (e) {
      threw = true
      expect(e).toBeInstanceOf(FbxError)
      expect((e as FbxError).code).toBe('INVALID_DATA')
    }
    expect(threw).toBe(true)
  })

  it('setInflateRecorder captures then releases', () => {
    const payload = new Uint8Array(deflateSync(Buffer.from('hello world')))
    const records: Array<{ input: Uint8Array; output: Uint8Array }> = []
    setInflateRecorder(records)
    try {
      const out = inflate(payload)
      expect(new TextDecoder().decode(out)).toBe('hello world')
    } finally {
      setInflateRecorder(undefined)
    }
    expect(records).toHaveLength(1)
    expect(records[0]?.input).toBe(payload)

    // 关闭后不再记录
    inflate(payload)
    expect(records).toHaveLength(1)
  })
})
