import { describe, expect, it } from 'vitest'
import { FbxError } from '../src/util'
import { parse } from '../src/parse'

describe('parse', () => {
  it('rejects empty input before parsing', () => {
    expect(() => parse('')).toThrow(FbxError)
    try {
      parse('')
    } catch (error) {
      expect((error as FbxError).code).toBe('EMPTY_INPUT')
    }
  })

  it('rejects unknown format', () => {
    expect(() => parse('not-fbx')).toThrow(FbxError)
    try {
      parse('not-fbx')
    } catch (error) {
      expect((error as FbxError).code).toBe('UNKNOWN_FORMAT')
    }
  })

  it('rejects ascii without FBXVersion', () => {
    expect(() => parse('FBXHeaderExtension: {\n}\n')).toThrow(FbxError)
    try {
      parse('FBXHeaderExtension: {\n}\n')
    } catch (error) {
      expect((error as FbxError).code).toBe('INVALID_DATA')
    }
  })

  it('rejects ascii version below 6100', () => {
    const ascii = '; FBX\nFBXHeaderExtension:  {\n\tFBXVersion: 6000\n}\n'
    expect(() => parse(ascii)).toThrow(FbxError)
    try {
      parse(ascii)
    } catch (error) {
      expect((error as FbxError).code).toBe('UNSUPPORTED_VERSION')
    }
  })
})
