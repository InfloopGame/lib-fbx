export {
  BinaryParser,
  BinaryReader,
  detectFormat,
  getFbxVersion,
  inflate,
  isRootRef,
  normalizeFbx6Tree,
  objectRef,
  parse,
  parseConnRef,
  refKey,
  TextParser,
} from './parse'
export type { FbxRef } from './parse'
export { FbxError, FbxTree, version } from './util'
export type {
  FbxConnectionTuple,
  FbxConnections,
  FbxErrorCode,
  FbxFormat,
  FbxInput,
  FbxObjectId,
  FbxObjects,
  FbxParseResult,
  FbxProperty as FbxTreeProperty,
  FbxPropertyValue as FbxTreePropertyValue,
  FbxTreeData,
  FbxTreeNode,
} from './types'
export * from './sdk'
