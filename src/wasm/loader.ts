/**
 * wasm 后端加载器：base64 解码 -> WebAssembly.instantiate -> 缓存单例。
 * 生成的 pkg/fbx_wasm.js 是 wasm-bindgen 的 web target ESM 胶水。
 */
import init, { parse_binary } from './pkg/fbx_wasm.js'
import { WASM_BASE64 } from './inline'

let ready: Promise<void> | null = null

function decodeBase64(source: string): Uint8Array {
  const binary = atob(source)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function ensureWasmReady(): Promise<void> {
  if (!ready) {
    const bytes = decodeBase64(WASM_BASE64)
    ready = init({ module_or_path: bytes }).then(() => undefined)
  }
  await ready
}

export interface WasmDoc {
  version: number
  tree: Record<string, unknown>
}

export async function parseBinaryWithWasm(bytes: Uint8Array): Promise<WasmDoc> {
  await ensureWasmReady()
  return parse_binary(bytes) as WasmDoc
}
