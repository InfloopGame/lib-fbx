/**
 * inflate 验证：跑一次 TS `parse()` 记录所有 zlib payload，然后对每个 payload
 * 用 src/parse/inflate.ts（fflate）与 node:zlib.inflateSync 对比。
 *
 * 用法:
 *   pnpm tsx scripts/verify-inflate.ts <file.fbx>
 */
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { setInflateRecorder } from '../src/parse/inflate'
import { parse } from '../src/parse'

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

  const records: Array<{ input: Uint8Array; output: Uint8Array }> = []
  setInflateRecorder(records)
  try {
    parse(bytes)
  } finally {
    setInflateRecorder(undefined)
  }

  console.log(`压缩 array 数量: ${records.length}\n`)

  let allEqual = 0
  let differs = 0
  const samples: Array<{ idx: number; ts: Uint8Array; node: Uint8Array; input: Uint8Array }> = []

  records.forEach((rec, idx) => {
    const ts = rec.output
    let node: Uint8Array
    try {
      const out = inflateSync(rec.input)
      node = new Uint8Array(out.buffer, out.byteOffset, out.byteLength)
    } catch (e) {
      console.log(`[node-err] #${idx}: ${(e as Error).message}`)
      return
    }

    if (hash(ts) === hash(node)) {
      allEqual++
      return
    }

    differs++
    if (samples.length < 5) samples.push({ idx, ts, node, input: rec.input })
  })

  console.log('═'.repeat(80))
  console.log('inflate 对比汇总（fflate vs node:zlib）')
  console.log('═'.repeat(80))
  console.log(`总数:                     ${records.length}`)
  console.log(`一致:                     ${allEqual}`)
  console.log(`不同:                     ${differs}    ← 若非 0，src/parse/inflate.ts 有 bug`)

  if (samples.length > 0) {
    console.log('\n差异样本（前 5）:')
    for (const s of samples) {
      console.log(`\n  #${s.idx}  compressed_len=${s.input.length}  input head=${hex(s.input, 8)}`)
      console.log(`    node : len=${s.node.length}  sha=${hash(s.node)}  head=${hex(s.node)}`)
      console.log(`    ts   : len=${s.ts.length}  sha=${hash(s.ts)}  head=${hex(s.ts)}`)
      const dTsNode = firstDiffIndex(s.ts, s.node)
      if (dTsNode >= 0) {
        console.log(
          `    首个 ts vs node 差异 @ byte ${dTsNode}: ts=${s.ts[dTsNode]?.toString(16)} node=${s.node[dTsNode]?.toString(16)}`,
        )
      }
    }
  }

  process.exit(differs > 0 ? 1 : 0)
}

main().catch((e: unknown) => {
  console.error('执行失败:', e instanceof Error ? e.message : e)
  process.exit(2)
})
