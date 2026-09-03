import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { detectFormat, FbxError, parse, version } from '../src/index'

describe('public api', () => {
  it('re-exports detectFormat, parse, and FbxError', () => {
    expect(typeof detectFormat).toBe('function')
    expect(typeof parse).toBe('function')
    expect(new FbxError('EMPTY_INPUT', 'x')).toBeInstanceOf(Error)
  })

  it('keeps version in sync with package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string
    }
    expect(version).toBe(pkg.version)
  })
})
