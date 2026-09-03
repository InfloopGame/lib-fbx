import { describe, expect, it } from 'vitest'
import { FbxError } from '../src/util'

describe('FbxError', () => {
  it('sets name, code, and message', () => {
    const error = new FbxError('EMPTY_INPUT', 'empty')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('FbxError')
    expect(error.code).toBe('EMPTY_INPUT')
    expect(error.message).toBe('empty')
  })
})
