export { BinaryParser } from './binary-parser'
export { BinaryReader } from './binary-reader'
export { detectFormat, getFbxVersion } from './detect'
export { inflate } from './inflate'
export { normalizeFbx6Tree } from './normalize-fbx6'
export { parse } from './parse'
export { ensureWasmReady, parseWasm } from './parse-wasm'
export { TextParser } from './text-parser'
export { FbxError, FbxTree, version } from './util'
export type {
  FbxConnectionTuple,
  FbxConnections,
  FbxDocument,
  FbxErrorCode,
  FbxFormat,
  FbxGlobalSettings,
  FbxInput,
  FbxNode,
  FbxObjects,
  FbxProperty,
  FbxPropertyValue,
  FbxTreeData,
} from './types'
