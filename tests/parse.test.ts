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

  it('accepts ascii FBX 6000 and still normalizes 6.x trees', () => {
    const ascii = `; FBX 6.0
FBXHeaderExtension:  {
	FBXVersion: 6000
}
Objects:  {
	Model: 10, "Model::Box", "Mesh" {
		Vertices: *6 {
			a: 0,0,0,1,0,0
		}
		Properties60:  {
			Property: "Lcl Translation", "Lcl Translation", "A+",4,5,6
		}
	}
	Deformer: 20, "Deformer::Skin", "Skin" {
	}
}
Connections:  {
	Connect: "OO",20,10
}
`
    const doc = parse(ascii)
    expect(doc.version).toBe(6000)
    expect(doc.format).toBe('ascii')
    const geo = (doc.tree.Objects as { Geometry?: Record<string, { Vertices?: { a: Float64Array } }> })?.Geometry?.[900000]
    expect(Array.from(geo?.Vertices?.a ?? [])).toEqual([0, 0, 0, 1, 0, 0])
    const conns = ((doc.tree.Connections as { connections?: unknown[] } | undefined)?.connections ?? []) as unknown[]
    expect(conns).toContainEqual([20, 900000])
    expect(conns).toContainEqual([900000, 10])
  })

  it('rejects ascii version below 6000', () => {
    const ascii = '; FBX\nFBXHeaderExtension:  {\n\tFBXVersion: 5900\n}\n'
    expect(() => parse(ascii)).toThrow(FbxError)
    try {
      parse(ascii)
    } catch (error) {
      expect((error as FbxError).code).toBe('UNSUPPORTED_VERSION')
    }
  })
})
