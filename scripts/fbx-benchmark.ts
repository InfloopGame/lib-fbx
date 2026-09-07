/**
 * 递归扫描目录下的 .fbx，统计 `parse()` 加载速度。
 *
 * 用法:
 *   pnpm bench
 *   pnpm bench -- tests/fixtures
 *   pnpm bench -- D:/models
 *   pnpm bench -- D:/models --iterations 5
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { parse } from '../src/parse'
import type { FbxFormat } from '../src/types'

interface BenchResult {
  file: string
  size: number
  format?: FbxFormat
  version?: number
  timeMs: number
  error?: string
}

interface CliOptions {
  target: string
  iterations: number
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

async function timeParse(
  buffer: Buffer,
  iterations: number,
): Promise<{ timeMs: number; format: FbxFormat; version: number }> {
  const runs: number[] = []
  let format: FbxFormat = 'binary'
  let version = 0
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    const parsed = parse(buffer)
    runs.push(performance.now() - start)
    format = parsed.format
    version = parsed.version
  }
  return { timeMs: median(runs), format, version }
}

async function benchmark(opts: CliOptions): Promise<number> {
  const { root, files } = await collectTargets(opts.target)

  console.log(`扫描: ${root}`)
  console.log(`迭代: 每文件 ${opts.iterations} 次取中位数\n`)
  if (files.length === 0) {
    console.log('未找到 .fbx 文件')
    return 0
  }

  console.log(`找到 ${files.length} 个 FBX 文件\n`)

  const widths = [46, 10, 8, 6, 12, 16]
  const header = ['文件', '大小', '格式', '版本', 'parse(ms)', '状态']
  const sepLen = widths.reduce((s, w) => s + w, 0)
  console.log('─'.repeat(sepLen))
  printRow(header, widths)
  console.log('─'.repeat(sepLen))

  const results: BenchResult[] = []

  for (const filePath of files) {
    const fileInfo = await stat(filePath)
    const buffer = await readFile(filePath)
    const rel = relative(root, filePath) || filePath
    const result: BenchResult = { file: rel, size: fileInfo.size, timeMs: 0 }

    try {
      const { timeMs, format, version } = await timeParse(buffer, opts.iterations)
      result.timeMs = timeMs
      result.format = format
      result.version = version
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error)
    }

    results.push(result)

    printRow(
      [
        result.file.slice(0, 44),
        formatSize(result.size),
        result.format ?? '-',
        result.version?.toString() ?? '-',
        result.error ? 'fail' : result.timeMs.toFixed(2),
        result.error ? 'fail' : 'ok',
      ],
      widths,
    )
  }

  printSummary(results)

  const failed = results.filter((r) => r.error)
  if (failed.length > 0) {
    console.log('\n失败详情:')
    for (const r of failed) {
      console.log(`  ${r.file}: ${r.error}`)
    }
  }

  return failed.length
}

function printSummary(results: BenchResult[]): void {
  const totalSize = results.reduce((s, r) => s + r.size, 0)
  const successes = results.filter((r) => !r.error)
  const failures = results.filter((r) => r.error)
  const totalTime = successes.reduce((s, r) => s + r.timeMs, 0)

  console.log('\n' + '═'.repeat(80))
  console.log('汇总')
  console.log('═'.repeat(80))
  console.log(`文件总数:   ${results.length}`)
  console.log(`总大小:     ${formatSize(totalSize)}`)
  console.log(`成功:       ${successes.length}`)
  console.log(`失败:       ${failures.length}`)
  console.log(`总耗时:     ${totalTime.toFixed(2)} ms`)
  if (successes.length > 0) {
    const times = successes.map((r) => r.timeMs).sort((a, b) => a - b)
    console.log(`平均耗时:   ${(totalTime / successes.length).toFixed(2)} ms`)
    console.log(`最快:       ${(times[0] ?? 0).toFixed(2)} ms`)
    console.log(`最慢:       ${(times[times.length - 1] ?? 0).toFixed(2)} ms`)
    console.log(`中位数:     ${median(times).toFixed(2)} ms`)
    if (totalTime > 0) {
      const sizeSucceeded = successes.reduce((s, r) => s + r.size, 0)
      console.log(`吞吐量:     ${formatSize(sizeSucceeded / (totalTime / 1000))}/s`)
    }
  }
}

function parseArgs(): CliOptions {
  const raw = process.argv.slice(2).filter((a) => a !== '--')
  const opts: CliOptions = {
    target: 'tests/fixtures',
    iterations: 3,
  }
  const positional: string[] = []
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i] ?? ''
    if (arg === '-h' || arg === '--help') {
      printHelp()
      process.exit(0)
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
  console.log('  -n, --iterations <N>   每文件跑 N 次取中位数（默认 3）')
  console.log('  -h, --help             显示帮助')
  console.log('')
  console.log('未传路径时默认扫描 tests/fixtures')
}

try {
  const opts = parseArgs()
  benchmark(opts)
    .then((failed) => process.exit(failed > 0 ? 1 : 0))
    .catch((error: unknown) => {
      console.error('执行失败:', error instanceof Error ? error.message : error)
      process.exit(1)
    })
} catch (error) {
  console.error('执行失败:', error instanceof Error ? error.message : error)
  process.exit(1)
}
