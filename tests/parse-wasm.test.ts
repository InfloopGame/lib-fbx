import { describe, expect, it } from 'vitest'
import { parse } from '../src/parse'
import { ensureWasmReady, parseWasm } from '../src/parse-wasm'
import { FbxError } from '../src/util'
import type { FbxParseResult } from '../src/types'
import { loadFixture } from './helpers/load-fixture'

function objects(doc: FbxParseResult): Record<string, Record<string, Record<string, unknown>>> {
  return (doc.tree.Objects ?? {}) as Record<string, Record<string, Record<string, unknown>>>
}

/**
 * 深度比较用的归一化：
 * - typed array → 普通 Array（掩掉 wasm/TS 后端在 array 类型上的差异）
 * - Uint8Array / ArrayBuffer → 相同的字节序列包装
 * - 忽略 `propertyList` / `singleProperty` —— 二者是解析中间字段，wasm 后端为规避
 *   大数组克隆做了性能相关的差异化处理，用户可见的字段（.a / .value / id 等）仍完全对齐。
 */
function normalize(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return { __bytes__: Array.from(value) }
  }
  if (value instanceof ArrayBuffer) {
    return { __bytes__: Array.from(new Uint8Array(value)) }
  }
  if (value instanceof Float64Array || value instanceof Float32Array || value instanceof Int32Array) {
    return Array.from(value)
  }
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      if (key === 'propertyList' || key === 'singleProperty') continue
      out[key] = normalize((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

describe('parseWasm', () => {
  it('boots wasm module lazily and is idempotent', async () => {
    await ensureWasmReady()
    await ensureWasmReady()
  })

  it('rejects empty input via detectFormat', async () => {
    await expect(parseWasm(new Uint8Array())).rejects.toBeInstanceOf(FbxError)
  })

  it('rejects ASCII FBX (binary-only backend)', async () => {
    const ascii = '; FBX\nFBXHeaderExtension:  {\n\tFBXVersion: 7400\n}\n'
    await expect(parseWasm(ascii)).rejects.toMatchObject({ code: 'UNKNOWN_FORMAT' })
  })

  it('maps rust errors back into FbxError with UNSUPPORTED_VERSION code', async () => {
    await expect(parseWasm(loadFixture('binary-6000-unsupported.fbx'))).rejects.toMatchObject({
      code: 'UNSUPPORTED_VERSION',
    })
  })

  it('wraps other rust failures as INVALID_DATA', async () => {
    const magic = new TextEncoder().encode('Kaydara FBX Binary  \0')
    const truncated = new Uint8Array(magic.length + 4)
    truncated.set(magic)
    truncated[21] = 0x1a
    truncated[22] = 0x00
    await expect(parseWasm(truncated)).rejects.toMatchObject({ code: 'INVALID_DATA' })
  })

  for (const fixture of [
    'binary-7400-triangle.fbx',
    'binary-7500-props.fbx',
    'binary-6100-embedded.fbx',
    '20269546453281.fbx',
  ]) {
    it(`matches TS backend for ${fixture}`, async () => {
      const bytes = loadFixture(fixture)
      const wasm = await parseWasm(bytes)
      const ts = parse(bytes)
      expect(wasm.format).toBe(ts.format)
      expect(wasm.version).toBe(ts.version)
      expect(normalize(wasm.tree)).toEqual(normalize(ts.tree))
    })
  }

  it('exposes selected fields from binary-7500 through wasm backend', async () => {
    const doc = await parseWasm(loadFixture('binary-7500-props.fbx'))
    expect(doc.version).toBe(7500)

    const video = objects(doc).Video?.[9]
    expect(video?.Flag).toBe(-3)
    expect(video?.Scale).toBeCloseTo(1.5)
    expect(new Uint8Array(video?.Blob as ArrayBufferLike)).toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(video?.Enabled).toBe(false)
    expect((video?.Weights as { a: boolean[] }).a).toEqual([true, false, true])
    // TS 和 wasm 两个后端的数字数组现在统一为 Float64Array；调用方按需 Array.from 或直接遍历 typed array。
    expect(Array.from((video?.Times as { a: Float64Array }).a)).toEqual([1, 2, 3])
  })
})
