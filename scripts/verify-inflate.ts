/**
 * 三方 inflate 验证：跑一次 TS `parse()` 记录所有 zlib payload，然后对每个 payload
 * 用 src/inflate.ts / node:zlib.inflateSync / wasm miniz_oxide 三方解压对比。
 *
 * 用法:
 *   pnpm tsx scripts/verify-inflate.ts <file.fbx>
 */
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { setInflateRecorder } from '../src/inflate'
import { parse } from '../src/parse'
import { ensureWasmReady } from '../src/parse-wasm'
import wasm from '../src/wasm/pkg/fbx_wasm.js'

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 12)
}

function hex(bytes: Uint8Array, n = 16): string {
  return Array.from(bytes.slice(0, n))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ')
}

function firstDiffIndex(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i
  return a.length === b.length ? -1 : n
}

async function main() {
  const path = process.argv[2]
  if (!path) {
    console.error('用法: pnpm tsx scripts/verify-inflate.ts <file.fbx>')
    process.exit(1)
  }

  const buffer = await readFile(path)
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  console.log(`文件: ${path} (${bytes.length} B)`)

  await ensureWasmReady()
  const wasmInflate = (wasm as unknown as { inflate_debug: (b: Uint8Array) => Uint8Array }).inflate_debug

  // 用 recorder 收集所有 inflate payload
  const records: Array<{ input: Uint8Array; output: Uint8Array }> = []
  setInflateRecorder(records)
  ;(globalThis as { __INFLATE_TRACE__?: boolean }).__INFLATE_TRACE__ = true
  try {
    parse(bytes)
  } finally {
    setInflateRecorder(undefined)
    ;(globalThis as { __INFLATE_TRACE__?: boolean }).__INFLATE_TRACE__ = false
  }

  console.log(`压缩 array 数量: ${records.length}\n`)

  let allEqual = 0
  let tsDiffers = 0
  let wasmDiffers = 0
  let bothDiffer = 0
  const samples: Array<{ idx: number; ts: Uint8Array; node: Uint8Array; wasm: Uint8Array; input: Uint8Array }> = []

  records.forEach((rec, idx) => {
    const ts = rec.output
    let node: Uint8Array
    let ws: Uint8Array
    try {
      const out = inflateSync(rec.input)
      node = new Uint8Array(out.buffer, out.byteOffset, out.byteLength)
    } catch (e) {
      console.log(`[node-err] #${idx}: ${(e as Error).message}`)
      return
    }
    try {
      ws = wasmInflate(rec.input)
    } catch (e) {
      console.log(`[wasm-err] #${idx}: ${(e as Error).message}`)
      return
    }

    const hTs = hash(ts)
    const hNode = hash(node)
    const hWasm = hash(ws)

    const tsOk = hTs === hNode
    const wasmOk = hWasm === hNode

    if (tsOk && wasmOk) {
      allEqual++
      return
    }

    if (!tsOk && wasmOk) tsDiffers++
    else if (tsOk && !wasmOk) wasmDiffers++
    else bothDiffer++

    if (samples.length < 5) samples.push({ idx, ts, node, wasm: ws, input: rec.input })
  })

  console.log('═'.repeat(80))
  console.log('三方 inflate 对比汇总')
  console.log('═'.repeat(80))
  console.log(`总数:                     ${records.length}`)
  console.log(`三方一致:                 ${allEqual}`)
  console.log(`仅 TS 与 node 不同:       ${tsDiffers}    ← 若非 0，src/inflate.ts 有 bug`)
  console.log(`仅 WASM 与 node 不同:     ${wasmDiffers}    ← 若非 0，wasm/miniz_oxide 有 bug`)
  console.log(`TS 和 WASM 都与 node 不同: ${bothDiffer}`)

  if (samples.length > 0) {
    console.log('\n差异样本（前 5）:')
    for (const s of samples) {
      console.log(`\n  #${s.idx}  compressed_len=${s.input.length}  input head=${hex(s.input, 8)}`)
      console.log(`    node : len=${s.node.length}  sha=${hash(s.node)}  head=${hex(s.node)}`)
      console.log(`    ts   : len=${s.ts.length}  sha=${hash(s.ts)}  head=${hex(s.ts)}`)
      console.log(`    wasm : len=${s.wasm.length}  sha=${hash(s.wasm)}  head=${hex(s.wasm)}`)
      const dTsNode = firstDiffIndex(s.ts, s.node)
      const dWasmNode = firstDiffIndex(s.wasm, s.node)
      if (dTsNode >= 0) console.log(`    首个 ts vs node 差异 @ byte ${dTsNode}: ts=${s.ts[dTsNode]?.toString(16)} node=${s.node[dTsNode]?.toString(16)}`)
      if (dWasmNode >= 0) console.log(`    首个 wasm vs node 差异 @ byte ${dWasmNode}: wasm=${s.wasm[dWasmNode]?.toString(16)} node=${s.node[dWasmNode]?.toString(16)}`)
    }
  }

  process.exit(tsDiffers + wasmDiffers + bothDiffer > 0 ? 1 : 0)
}

main().catch((e: unknown) => {
  console.error('执行失败:', e instanceof Error ? e.message : e)
  process.exit(2)
})
