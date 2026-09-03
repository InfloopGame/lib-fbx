/**
 * Zlib 解压缩（FBX 二进制数组属性）
 *
 * 换成 `fflate.unzlibSync`：pure JS 但比原手写实现快 5-10x（V8 fast path 优化过 + 减少分配 + LZ77 back-ref 走 memcpy）。
 * 一份代码跨 Node / 浏览器 / bundler。
 *
 * 未做 Node `zlib.inflateSync` 快路径的原因：
 *   - 需要 conditional exports 或 CJS-only 测试才能覆盖，工程成本 > 收益
 *   - fflate 5-10x 已经把原来的手写热点从瓶颈里移出去
 *   - 未来若确有需求可以补一个 `setInflater(fn)` hook，让 Node 用户注入 zlib.inflateSync
 */
import { unzlibSync } from 'fflate'
import { FbxError } from './util'

/** 调试用 recorder：非 undefined 时会记录每次 inflate 的 input/output，供 scripts/verify-inflate.ts 三方对比。 */
export let inflateRecorder: Array<{ input: Uint8Array; output: Uint8Array }> | undefined

export function setInflateRecorder(rec: Array<{ input: Uint8Array; output: Uint8Array }> | undefined): void {
  inflateRecorder = rec
}

/**
 * FBX 里所有压缩数组都是标准 zlib 流（含 CMF/FLG 头 + Adler32 校验），
 * `fflate.unzlibSync` 直接吞掉整包，不用手动剥头尾。
 */
export function inflate(data: Uint8Array): Uint8Array {
  if (data.length < 6) {
    throw new FbxError('INVALID_DATA', 'inflate: input too short')
  }

  const cmf = data[0] ?? 0
  const method = cmf & 0x0f
  if (method !== 8) {
    throw new FbxError('INVALID_DATA', 'inflate: unsupported compression method')
  }

  let output: Uint8Array
  try {
    output = unzlibSync(data)
  } catch (e) {
    throw new FbxError('INVALID_DATA', `inflate: ${(e as Error).message}`)
  }

  if (inflateRecorder) inflateRecorder.push({ input: data, output })
  return output
}
