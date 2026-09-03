import { detectFormat } from './detect'
import { normalizeFbx6Tree } from './normalize-fbx6'
import type { FbxDocument, FbxInput, FbxTreeData } from './types'
import { FbxError, FbxTree, toBytes } from './util'
import { parseBinaryWithWasm } from './wasm/loader'

/**
 * 使用 Rust/WASM 后端解析 binary FBX；ASCII 仍需走 {@link parse}。
 * 首次调用会异步初始化内联的 wasm 模块，后续复用。
 */
export async function parseWasm(input: FbxInput): Promise<FbxDocument> {
  const format = detectFormat(input)
  if (format !== 'binary') {
    throw new FbxError('UNKNOWN_FORMAT', 'parseWasm currently supports binary FBX only')
  }

  const bytes = toBytes(input)
  let version: number
  let tree: Record<string, unknown>
  try {
    const parsed = await parseBinaryWithWasm(bytes)
    version = parsed.version
    tree = parsed.tree
  } catch (raw) {
    const message = typeof raw === 'string' ? raw : (raw as Error)?.message ?? String(raw)
    const code = /not supported/i.test(message) ? 'UNSUPPORTED_VERSION' : 'INVALID_DATA'
    throw new FbxError(code, message)
  }

  if (version < 7000) {
    const wrapped = Object.assign(new FbxTree(), tree)
    normalizeFbx6Tree(wrapped)
    return { format, version, tree: wrapped as unknown as FbxTreeData }
  }

  return { format, version, tree: tree as FbxTreeData }
}

export { ensureWasmReady } from './wasm/loader'
