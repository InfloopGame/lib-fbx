import type { FbxFormat, FbxInput } from './types'
import { FbxError, toBytes } from './util'

/** Binary FBX 文件头前 21 字节：`Kaydara FBX Binary  \0` */
export const BINARY_MAGIC = 'Kaydara FBX Binary  \0'

export function detectFormat(input: FbxInput): FbxFormat {
  const bytes = toBytes(input)
  if (bytes.byteLength === 0) {
    throw new FbxError('EMPTY_INPUT', 'FBX input is empty')
  }

  const magicLen = Math.min(bytes.byteLength, BINARY_MAGIC.length)
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, magicLen))
  if (head.startsWith('Kaydara FBX Binary')) {
    return 'binary'
  }

  const previewLen = Math.min(bytes.byteLength, 4096)
  const text =
    typeof input === 'string' ? input : new TextDecoder('utf8').decode(bytes.subarray(0, previewLen))
  if (text.includes('FBXHeaderExtension') || text.includes('FBXVersion:') || text.trimStart().startsWith(';')) {
    return 'ascii'
  }

  throw new FbxError('UNKNOWN_FORMAT', 'Not a recognized FBX file')
}

export function getFbxVersion(text: string): number {
  const match = text.match(/FBXVersion:\s*(\d+)/)
  if (match?.[1]) return parseInt(match[1], 10)
  throw new FbxError('INVALID_DATA', 'Cannot find the version number for the file')
}
