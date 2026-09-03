import { BinaryParser } from './binary-parser'
import { detectFormat, getFbxVersion } from './detect'
import { FbxError, toArrayBuffer, toBytes } from './util'
import { normalizeFbx6Tree } from './normalize-fbx6'
import { TextParser } from './text-parser'
import type { FbxDocument, FbxInput, FbxTreeData } from './types'

export function parse(input: FbxInput): FbxDocument {
  const format = detectFormat(input)
  const bytes = toBytes(input)

  if (format === 'binary') {
    const parser = new BinaryParser()
    const tree = parser.parse(toArrayBuffer(bytes))
    if (parser.version < 7000) normalizeFbx6Tree(tree)
    return { format, version: parser.version, tree: tree as unknown as FbxTreeData }
  }

  const text = typeof input === 'string' ? input : new TextDecoder().decode(bytes)
  const version = getFbxVersion(text)
  if (version < 6100) {
    throw new FbxError('UNSUPPORTED_VERSION', `FBX version not supported, FileVersion: ${version}`)
  }

  const tree = new TextParser().parse(text, version)
  if (version < 7000) normalizeFbx6Tree(tree)
  return { format, version, tree: tree as unknown as FbxTreeData }
}
