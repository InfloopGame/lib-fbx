import { describe, expect, it } from 'vitest'
import { toArrayBuffer, toBytes } from '../src/util'

describe('toBytes', () => {
  it('encodes string as utf8', () => {
    expect(toBytes('FBX')).toEqual(new TextEncoder().encode('FBX'))
  })

  it('returns the same Uint8Array instance', () => {
    const bytes = new Uint8Array([1, 2, 3])
    expect(toBytes(bytes)).toBe(bytes)
  })

  it('copies ArrayBuffer into Uint8Array', () => {
    const buffer = new Uint8Array([9, 8, 7]).buffer
    expect(toBytes(buffer)).toEqual(new Uint8Array([9, 8, 7]))
  })
})

describe('toArrayBuffer', () => {
  it('slices a view into a standalone ArrayBuffer', () => {
    const parent = new Uint8Array([0, 1, 2, 3, 4])
    const view = parent.subarray(1, 4)
    const isolated = toArrayBuffer(view)
    expect(new Uint8Array(isolated)).toEqual(new Uint8Array([1, 2, 3]))
    expect(isolated.byteLength).toBe(3)
  })
})
