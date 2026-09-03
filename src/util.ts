import type { FbxErrorCode, FbxInput } from './types'

export const version = '0.0.1'

export class FbxError extends Error {
  readonly code: FbxErrorCode

  constructor(code: FbxErrorCode, message: string) {
    super(message)
    this.name = 'FbxError'
    this.code = code
  }
}

export class FbxTree {
  [key: string]: unknown

  add(key: string, val: unknown): void {
    this[key] = val
  }
}

export function toBytes(input: FbxInput): Uint8Array {
  if (typeof input === 'string') {
    return new TextEncoder().encode(input)
  }
  if (input instanceof Uint8Array) {
    return input
  }
  return new Uint8Array(input)
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
