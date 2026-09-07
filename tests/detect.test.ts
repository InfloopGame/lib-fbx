import { describe, expect, it } from 'vitest'
import { detectFormat, getFbxVersion } from '../src/parse/detect'
import { FbxError } from '../src/util'

const BINARY_MAGIC = 'Kaydara FBX Binary  \0'

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('detectFormat', () => {
  it('detects binary from magic string / Uint8Array / ArrayBuffer', () => {
    expect(detectFormat(BINARY_MAGIC)).toBe('binary')
    const bytes = encode(BINARY_MAGIC)
    const buffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(buffer).set(bytes)
    expect(detectFormat(bytes)).toBe('binary')
    expect(detectFormat(buffer)).toBe('binary')
  })

  it('detects binary when only the prefix is present', () => {
    expect(detectFormat('Kaydara FBX Binary')).toBe('binary')
  })

  it('detects ascii from FBXHeaderExtension or FBXVersion', () => {
    const ascii = 'FBXHeaderExtension: {\n}\n'
    expect(detectFormat(ascii)).toBe('ascii')
    expect(detectFormat(encode(ascii))).toBe('ascii')
    expect(detectFormat('FBXVersion: 7400\n')).toBe('ascii')
  })

  it('detects ascii from leading comment', () => {
    expect(detectFormat('; FBX 7.4.0 project file\n')).toBe('ascii')
    expect(detectFormat('  ; padded comment\n')).toBe('ascii')
  })

  it('throws EMPTY_INPUT for empty payloads', () => {
    for (const input of ['', new Uint8Array(), new ArrayBuffer(0)]) {
      try {
        detectFormat(input)
        expect.unreachable()
      } catch (error) {
        expect(error).toBeInstanceOf(FbxError)
        expect((error as FbxError).code).toBe('EMPTY_INPUT')
      }
    }
  })

  it('throws UNKNOWN_FORMAT for unrelated data', () => {
    expect(() => detectFormat('hello')).toThrow(FbxError)
    expect(() => detectFormat(new Uint8Array([0, 1, 2, 3]))).toThrowError(/Not a recognized FBX file/)
  })
})

describe('getFbxVersion', () => {
  it('reads FBXVersion from ascii text', () => {
    expect(getFbxVersion('FBXVersion: 7400')).toBe(7400)
  })

  it('throws when version is missing', () => {
    expect(() => getFbxVersion('FBXHeaderExtension: {\n}\n')).toThrow(FbxError)
    try {
      getFbxVersion('no version here')
    } catch (error) {
      expect((error as FbxError).code).toBe('INVALID_DATA')
    }
  })
})
