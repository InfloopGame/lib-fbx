/**
 * 递归扫描目录下的 .fbx，同时统计 TS `parse()` 与 WASM `parseWasm()` 的加载速度，
 * 或用 `--diff` 检查两端解析结果是否一致。
 *
 * 用法:
 *   pnpm bench
 *   pnpm bench -- tests/fixtures
 *   pnpm bench -- D:/models
 *   pnpm bench -- D:/models --iterations 5
 *   pnpm bench -- D:/models --js-only
 *   pnpm bench -- D:/models --wasm-only
 *   pnpm bench -- D:/models --diff          # 一致性对比（TS vs WASM）
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { parse } from '../src/parse'
import { ensureWasmReady, parseWasm } from '../src/parse-wasm'
import type { FbxFormat } from '../src/types'

type Backend = 'js' | 'wasm'

interface BenchResult {
  file: string
  size: number
  format?: FbxFormat
  version?: number
  js?: { timeMs: number; error?: string }
  wasm?: { timeMs: number; error?: string; skipped?: boolean }
}

interface CliOptions {
  target: string
  iterations: number
  runJs: boolean
  runWasm: boolean
  diff: boolean
}

interface DiffResult {
  file: string
  ok: boolean
  diffs: string[]
  error?: string
}

async function findFbxFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await findFbxFiles(fullPath)))
    } else if (entry.name.toLowerCase().endsWith('.fbx')) {
      files.push(fullPath)
    }
  }

  return files
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function padCell(cell: string, width: number): string {
  const visible = [...cell]
  if (visible.length >= width) return cell
  return cell + ' '.repeat(width - visible.length)
}

function printRow(cells: string[], widths: number[]): void {
  console.log(cells.map((cell, i) => padCell(cell, widths[i] ?? 0)).join(''))
}

async function collectTargets(input: string): Promise<{ root: string; files: string[] }> {
  const root = resolve(input)
  const info = await stat(root)

  if (info.isFile()) {
    if (!root.toLowerCase().endsWith('.fbx')) {
      throw new Error(`"${input}" 不是 .fbx 文件`)
    }
    return { root: join(root, '..'), files: [root] }
  }

  if (!info.isDirectory()) {
    throw new Error(`"${input}" 不是有效目录`)
  }

  return { root, files: (await findFbxFiles(root)).sort() }
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  return sorted[mid] ?? 0
}

async function timeBackend(
  backend: Backend,
  buffer: Buffer,
  iterations: number,
): Promise<{ timeMs: number; format: FbxFormat; version: number }> {
  const runs: number[] = []
  let format: FbxFormat = 'binary'
  let version = 0
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    const parsed = backend === 'js' ? parse(buffer) : await parseWasm(buffer)
    runs.push(performance.now() - start)
    format = parsed.format
    version = parsed.version
  }
  return { timeMs: median(runs), format, version }
}

async function benchmark(opts: CliOptions): Promise<number> {
  const { root, files } = await collectTargets(opts.target)

  console.log(`扫描: ${root}`)
  console.log(`迭代: 每文件每后端 ${opts.iterations} 次取中位数`)
  console.log(
    `后端: ${[opts.runJs ? 'js' : null, opts.runWasm ? 'wasm' : null].filter(Boolean).join(' + ') || '<none>'}\n`,
  )
  if (files.length === 0) {
    console.log('未找到 .fbx 文件')
    return 0
  }

  console.log(`找到 ${files.length} 个 FBX 文件\n`)

  if (opts.runWasm) {
    const wasmStart = performance.now()
    await ensureWasmReady()
    console.log(`wasm 初始化: ${(performance.now() - wasmStart).toFixed(2)} ms\n`)
  }

  const widths = [46, 10, 8, 6, 12, 12, 10, 16]
  const header = ['文件', '大小', '格式', '版本', 'js(ms)', 'wasm(ms)', 'speedup', '状态']
  const sepLen = widths.reduce((s, w) => s + w, 0)
  console.log('─'.repeat(sepLen))
  printRow(header, widths)
  console.log('─'.repeat(sepLen))

  const results: BenchResult[] = []

  for (const filePath of files) {
    const fileInfo = await stat(filePath)
    const buffer = await readFile(filePath)
    const rel = relative(root, filePath) || filePath
    const result: BenchResult = { file: rel, size: fileInfo.size }

    if (opts.runJs) {
      try {
        const { timeMs, format, version } = await timeBackend('js', buffer, opts.iterations)
        result.js = { timeMs }
        result.format = format
        result.version = version
      } catch (error) {
        result.js = { timeMs: 0, error: error instanceof Error ? error.message : String(error) }
      }
    }

    if (opts.runWasm) {
      const isBinary = detectBinary(buffer)
      if (!isBinary) {
        result.wasm = { timeMs: 0, skipped: true }
      } else {
        try {
          const { timeMs, format, version } = await timeBackend('wasm', buffer, opts.iterations)
          result.wasm = { timeMs }
          result.format ??= format
          result.version ??= version
        } catch (error) {
          result.wasm = { timeMs: 0, error: error instanceof Error ? error.message : String(error) }
        }
      }
    }

    results.push(result)

    const js = result.js?.timeMs ?? 0
    const wasm = result.wasm?.timeMs ?? 0
    const speedup =
      result.js?.error || result.wasm?.error || result.wasm?.skipped || !opts.runJs || !opts.runWasm
        ? '-'
        : wasm > 0
          ? `${(js / wasm).toFixed(2)}x`
          : '-'

    const status = describeStatus(result, opts)
    printRow(
      [
        result.file.slice(0, 44),
        formatSize(result.size),
        result.format ?? '-',
        result.version?.toString() ?? '-',
        result.js ? (result.js.error ? 'fail' : js.toFixed(2)) : '-',
        result.wasm ? (result.wasm.skipped ? 'n/a' : result.wasm.error ? 'fail' : wasm.toFixed(2)) : '-',
        speedup,
        status,
      ],
      widths,
    )
  }

  printSummary(results, opts)

  const anyFail = results.filter((r) => r.js?.error || (r.wasm && !r.wasm.skipped && r.wasm.error))
  if (anyFail.length > 0) {
    console.log('\n失败详情:')
    for (const r of anyFail) {
      if (r.js?.error) console.log(`  [js]   ${r.file}: ${r.js.error}`)
      if (r.wasm?.error) console.log(`  [wasm] ${r.file}: ${r.wasm.error}`)
    }
  }

  // 只在两端行为不一致时（一端 ok 另一端 fail）认为 bench 出错。
  // 单端跑或两端都 fail 视为一致，不影响 exit code。
  if (!opts.runJs || !opts.runWasm) return 0
  const inconsistent = results.filter((r) => {
    const jsFail = Boolean(r.js?.error)
    const wasmFail = Boolean(r.wasm?.error)
    if (r.wasm?.skipped) return false
    return jsFail !== wasmFail
  })
  return inconsistent.length
}

function detectBinary(buffer: Buffer): boolean {
  return buffer.length >= 20 && buffer.subarray(0, 20).toString('latin1').startsWith('Kaydara FBX Binary')
}

/**
 * 一致性对比模式：TS parse() vs WASM parseWasm()。
 * 归一化：typed array → 普通数组；Uint8Array/ArrayBuffer → 字节数组；
 * 忽略 `propertyList` / `singleProperty` —— wasm 侧做了 move 优化避免克隆大数组，
 * 两个字段是内部路由用途，用户 API（.a / .value / .id / .attrName）完全对齐。
 */
function normalizeTree(value: unknown): unknown {
  // 字节 blob：TS 侧是 ArrayBuffer / wasm 侧是 Uint8Array，都包装成 __bytes__ 数组便于对比
  if (value instanceof Uint8Array) {
    return { __bytes__: Array.from(value) }
  }
  if (value instanceof ArrayBuffer) {
    return { __bytes__: Array.from(new Uint8Array(value)) }
  }
  // 数字 typed array：wasm 侧返回 Float64Array；TS 侧是 number[]。都拉平成普通 Array
  if (value instanceof Float64Array || value instanceof Float32Array || value instanceof Int32Array) {
    return Array.from(value as Iterable<number>)
  }
  if (Array.isArray(value)) return value.map(normalizeTree)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      if (key === 'propertyList' || key === 'singleProperty') continue
      out[key] = normalizeTree((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/** 收集 a → b 的差异 path 列表；到达 limit 后短路，避免大 tree 撑爆内存。 */
function collectDiffs(a: unknown, b: unknown, path: string, out: string[], limit = 50): void {
  if (out.length >= limit) return
  if (Object.is(a, b)) return
  if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) return
  if (a === null || b === null || typeof a !== typeof b) {
    out.push(`${path}: ${summarize(a)} vs ${summarize(b)}`)
    return
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      out.push(`${path}: length ${a.length} vs ${b.length}`)
      return
    }
    for (let i = 0; i < a.length; i++) collectDiffs(a[i], b[i], `${path}[${i}]`, out, limit)
    return
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>
    const bObj = b as Record<string, unknown>
    const aKeys = new Set(Object.keys(aObj))
    const bKeys = new Set(Object.keys(bObj))
    for (const k of aKeys) if (!bKeys.has(k)) out.push(`${path}.${k}: missing in wasm`)
    for (const k of bKeys) if (!aKeys.has(k)) out.push(`${path}.${k}: extra in wasm`)
    for (const k of aKeys) if (bKeys.has(k)) collectDiffs(aObj[k], bObj[k], `${path}.${k}`, out, limit)
    return
  }
  out.push(`${path}: ${summarize(a)} vs ${summarize(b)}`)
}

function summarize(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return value.length > 32 ? `"${value.slice(0, 29)}…"` : JSON.stringify(value)
  if (typeof value === 'object') return Array.isArray(value) ? `Array(${value.length})` : 'Object'
  return String(value)
}

async function runDiff(opts: CliOptions): Promise<number> {
  const { root, files } = await collectTargets(opts.target)
  console.log(`扫描: ${root}`)
  console.log('模式: 一致性对比（TS parse vs WASM parseWasm）\n')

  if (files.length === 0) {
    console.log('未找到 .fbx 文件')
    return 0
  }
  console.log(`找到 ${files.length} 个 FBX 文件\n`)

  const wasmStart = performance.now()
  await ensureWasmReady()
  console.log(`wasm 初始化: ${(performance.now() - wasmStart).toFixed(2)} ms\n`)

  const results: DiffResult[] = []
  for (const filePath of files) {
    const rel = relative(root, filePath) || filePath
    const buffer = await readFile(filePath)
    if (!detectBinary(buffer)) {
      console.log(`[skip] ${rel} (ascii)`)
      continue
    }
    const diffs: string[] = []
    let error: string | undefined
    let tsError: string | undefined
    let wasmError: string | undefined
    let tsDoc: ReturnType<typeof parse> | undefined
    let wasmDoc: Awaited<ReturnType<typeof parseWasm>> | undefined
    try {
      tsDoc = parse(buffer)
    } catch (e) {
      tsError = e instanceof Error ? e.message : String(e)
    }
    try {
      wasmDoc = await parseWasm(buffer)
    } catch (e) {
      wasmError = e instanceof Error ? e.message : String(e)
    }

    if (tsError && wasmError) {
      // 两端都失败：认为一致（如 v6000 unsupported）
      results.push({ file: rel, ok: true, diffs: [] })
      console.log(`[ok  ] ${rel} (both rejected: ${tsError})`)
      continue
    }
    if (tsError || wasmError) {
      error = `js:${tsError ?? 'ok'} wasm:${wasmError ?? 'ok'}`
    } else if (tsDoc && wasmDoc) {
      if (tsDoc.version !== wasmDoc.version) {
        diffs.push(`$.version: ${tsDoc.version} vs ${wasmDoc.version}`)
      }
      if (tsDoc.format !== wasmDoc.format) {
        diffs.push(`$.format: ${tsDoc.format} vs ${wasmDoc.format}`)
      }
      collectDiffs(normalizeTree(tsDoc.tree), normalizeTree(wasmDoc.tree), '$.tree', diffs)
    }

    const ok = !error && diffs.length === 0
    results.push({ file: rel, ok, diffs, error })
    if (error) {
      console.log(`[err ] ${rel}: ${error}`)
    } else if (ok) {
      console.log(`[ok  ] ${rel}`)
    } else {
      console.log(`[diff] ${rel} (${diffs.length}${diffs.length >= 50 ? '+' : ''} diffs)`)
      for (const d of diffs.slice(0, 3)) console.log(`         ${d}`)
      if (diffs.length > 3) console.log(`         ... (${diffs.length - 3}${diffs.length >= 50 ? '+' : ''} more)`)
    }
  }

  console.log('\n' + '═'.repeat(80))
  console.log('一致性汇总')
  console.log('═'.repeat(80))
  const okCount = results.filter((r) => r.ok).length
  const diffCount = results.filter((r) => !r.ok && !r.error).length
  const errCount = results.filter((r) => r.error).length
  console.log(`文件总数:   ${results.length}`)
  console.log(`一致:       ${okCount}`)
  console.log(`有差异:     ${diffCount}`)
  console.log(`异常:       ${errCount}`)

  if (diffCount > 0) {
    console.log('\n有差异的文件（前 10 个）:')
    for (const r of results.filter((r) => !r.ok && !r.error).slice(0, 10)) {
      console.log(`  ${r.file} (${r.diffs.length}${r.diffs.length >= 50 ? '+' : ''} diffs)`)
    }
  }

  return diffCount + errCount
}

function describeStatus(r: BenchResult, opts: CliOptions): string {
  const parts: string[] = []
  if (opts.runJs) parts.push(r.js?.error ? 'js:fail' : 'js:ok')
  if (opts.runWasm) parts.push(r.wasm?.skipped ? 'wasm:skip' : r.wasm?.error ? 'wasm:fail' : 'wasm:ok')
  return parts.join(' ')
}

function printSummary(results: BenchResult[], opts: CliOptions): void {
  const totalSize = results.reduce((s, r) => s + r.size, 0)
  console.log('\n' + '═'.repeat(80))
  console.log('汇总')
  console.log('═'.repeat(80))
  console.log(`文件总数:   ${results.length}`)
  console.log(`总大小:     ${formatSize(totalSize)}`)

  if (opts.runJs) printBackendStats('js', results, totalSize)
  if (opts.runWasm) printBackendStats('wasm', results, totalSize)

  if (opts.runJs && opts.runWasm) {
    const comparable = results.filter(
      (r) => r.js && !r.js.error && r.wasm && !r.wasm.skipped && !r.wasm.error && r.wasm.timeMs > 0,
    )
    if (comparable.length > 0) {
      const totalJs = comparable.reduce((s, r) => s + (r.js?.timeMs ?? 0), 0)
      const totalWasm = comparable.reduce((s, r) => s + (r.wasm?.timeMs ?? 0), 0)
      const speedups = comparable.map((r) => (r.js?.timeMs ?? 0) / (r.wasm?.timeMs ?? 1))
      console.log('\n--- 对比（仅两端都成功的 binary 文件） ---')
      console.log(`可对比文件: ${comparable.length}`)
      console.log(`js 总耗时:   ${totalJs.toFixed(2)} ms`)
      console.log(`wasm 总耗时: ${totalWasm.toFixed(2)} ms`)
      console.log(`总加速比:   ${totalWasm > 0 ? (totalJs / totalWasm).toFixed(2) : '-'}x`)
      console.log(`加速中位数: ${median(speedups).toFixed(2)}x`)
    }
  }
}

function printBackendStats(backend: Backend, results: BenchResult[], totalSize: number): void {
  const label = backend === 'js' ? 'TS' : 'WASM'
  const bucket = results.map((r) => (backend === 'js' ? r.js : r.wasm))
  const successes = bucket.filter(
    (b): b is { timeMs: number } => Boolean(b && !('error' in b && b.error) && !('skipped' in b && b.skipped)),
  )
  const failures = bucket.filter((b) => b && 'error' in b && b.error)
  const skipped = bucket.filter((b) => b && 'skipped' in b && b.skipped)

  const totalTime = successes.reduce((s, r) => s + r.timeMs, 0)
  console.log(`\n--- ${label} ---`)
  console.log(`成功:       ${successes.length}`)
  console.log(`失败:       ${failures.length}`)
  if (skipped.length > 0) console.log(`跳过:       ${skipped.length} (ascii)`)
  console.log(`总耗时:     ${totalTime.toFixed(2)} ms`)
  if (successes.length > 0) {
    const times = successes.map((r) => r.timeMs).sort((a, b) => a - b)
    console.log(`平均耗时:   ${(totalTime / successes.length).toFixed(2)} ms`)
    console.log(`最快:       ${(times[0] ?? 0).toFixed(2)} ms`)
    console.log(`最慢:       ${(times[times.length - 1] ?? 0).toFixed(2)} ms`)
    console.log(`中位数:     ${median(times).toFixed(2)} ms`)
    if (totalTime > 0) {
      const sizeSucceeded = results
        .filter((_, i) => bucket[i] && !bucket[i]!.error && !('skipped' in bucket[i]! && bucket[i]!.skipped))
        .reduce((s, r) => s + r.size, 0)
      const scale = sizeSucceeded > 0 ? sizeSucceeded : totalSize
      console.log(`吞吐量:     ${formatSize(scale / (totalTime / 1000))}/s`)
    }
  }
}

function parseArgs(): CliOptions {
  const raw = process.argv.slice(2).filter((a) => a !== '--')
  const opts: CliOptions = {
    target: 'tests/fixtures',
    iterations: 3,
    runJs: true,
    runWasm: true,
    diff: false,
  }
  const positional: string[] = []
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i] ?? ''
    if (arg === '-h' || arg === '--help') {
      printHelp()
      process.exit(0)
    } else if (arg === '--diff') {
      opts.diff = true
    } else if (arg === '--js-only') {
      opts.runWasm = false
    } else if (arg === '--wasm-only') {
      opts.runJs = false
    } else if (arg === '--iterations' || arg === '-n') {
      const value = raw[++i] ?? ''
      const n = parseInt(value, 10)
      if (!Number.isFinite(n) || n < 1) throw new Error(`--iterations 需要正整数，收到 "${value}"`)
      opts.iterations = n
    } else if (arg.startsWith('--iterations=')) {
      const value = arg.slice('--iterations='.length)
      const n = parseInt(value, 10)
      if (!Number.isFinite(n) || n < 1) throw new Error(`--iterations 需要正整数，收到 "${value}"`)
      opts.iterations = n
    } else if (arg.startsWith('-')) {
      throw new Error(`未知选项: ${arg}`)
    } else {
      positional.push(arg)
    }
  }
  if (positional[0]) opts.target = positional[0]
  return opts
}

function printHelp(): void {
  console.log('用法: pnpm bench -- [选项] [目录或.fbx文件]')
  console.log('')
  console.log('选项:')
  console.log('  -n, --iterations <N>   每文件每后端跑 N 次取中位数（默认 3）')
  console.log('      --js-only          仅测试 TypeScript 后端')
  console.log('      --wasm-only        仅测试 Rust/WASM 后端（binary 才生效）')
  console.log('      --diff             一致性对比：TS parse vs WASM parseWasm（不测速）')
  console.log('  -h, --help             显示帮助')
  console.log('')
  console.log('未传路径时默认扫描 tests/fixtures')
}

try {
  const opts = parseArgs()
  const runner = opts.diff ? runDiff(opts) : benchmark(opts)
  runner
    .then((failed) => process.exit(failed > 0 ? 1 : 0))
    .catch((error: unknown) => {
      console.error('执行失败:', error instanceof Error ? error.message : error)
      process.exit(1)
    })
} catch (error) {
  console.error('执行失败:', error instanceof Error ? error.message : error)
  process.exit(1)
}
