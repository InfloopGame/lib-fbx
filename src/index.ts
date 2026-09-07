export { BinaryParser } from './binary-parser'
export { BinaryReader } from './binary-reader'
export { detectFormat, getFbxVersion } from './detect'
export { inflate } from './inflate'
export { normalizeFbx6Tree } from './normalize-fbx6'
export { parse } from './parse'
export { TextParser } from './text-parser'
export { FbxError, FbxTree, version } from './util'
export type {
  FbxConnectionTuple,
  FbxConnections,
  FbxErrorCode,
  FbxFormat,
  FbxInput,
  FbxObjects,
  FbxParseResult,
  FbxProperty as FbxTreeProperty,
  FbxPropertyValue as FbxTreePropertyValue,
  FbxTreeData,
  FbxTreeNode,
} from './types'
export * from './sdk'
