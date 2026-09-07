import { describe, expect, it } from 'vitest'
import { detectFormat } from '../src/parse/detect'
import { FbxError } from '../src/util'
import { parse } from '../src/parse'
import type { FbxParseResult, FbxTreeData } from '../src/types'
import { loadFixture, loadFixtureText } from './helpers/load-fixture'

function objects(doc: FbxParseResult): Record<string, Record<string, Record<string, unknown>>> {
  return (doc.tree.Objects ?? {}) as Record<string, Record<string, Record<string, unknown>>>
}

function connections(doc: FbxParseResult): unknown[] {
  return ((doc.tree.Connections as { connections?: unknown[] } | undefined)?.connections ?? []) as unknown[]
}

describe('fbx cases', () => {
  describe('ascii-7400-triangle.fbx', () => {
    const bytes = loadFixture('ascii-7400-triangle.fbx')
    const text = loadFixtureText('ascii-7400-triangle.fbx')

    it('detects ascii and parses version 7400', () => {
      expect(detectFormat(bytes)).toBe('ascii')
      expect(detectFormat(text)).toBe('ascii')
      const doc = parse(bytes)
      expect(doc.format).toBe('ascii')
      expect(doc.version).toBe(7400)
    })

    it('reads triangle geometry, model transform, pose, video and connections', () => {
      const doc = parse(text)
      const objs = objects(doc)
      const geo = objs.Geometry?.[100]
      expect(geo?.attrName).toBe('Triangle')
      expect(geo?.attrType).toBe('Mesh')
      expect(Array.from((geo?.Vertices as { a: Float64Array }).a)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
      expect(Array.from((geo?.PolygonVertexIndex as { a: Float64Array }).a)).toEqual([0, 1, -3])

      const model = objs.Model?.[200]
      expect(model?.attrName).toBe('Triangle')
      expect((model?.Lcl_Translation as { value: number[] }).value).toEqual([1, 2, 3])

      const settings = doc.tree.GlobalSettings as {
        UnitScaleFactor?: { value: number }
        AmbientColor?: { value: number[] }
      }
      expect(settings.UnitScaleFactor?.value).toBe(1)
      expect(settings.AmbientColor?.value).toEqual([0.1, 0.2, 0.3])

      const pose = objs.Pose?.[400]
      expect(Array.isArray(pose?.PoseNode)).toBe(true)
      expect((pose?.PoseNode as { id: string }[]).map((n) => n.id)).toEqual(['200', '100'])

      expect(objs.Video?.[500]?.Content).toBe('ZmFrZS10ZXg=')
      expect(connections(doc)).toEqual([
        [100, 200],
        [300, 200],
      ])
    })
  })

  describe('ascii-6100-embedded.fbx', () => {
    it('normalizes embedded model geometry to a synthetic Geometry node', () => {
      const doc = parse(loadFixture('ascii-6100-embedded.fbx'))
      expect(doc.format).toBe('ascii')
      expect(doc.version).toBe(6100)

      const objs = objects(doc)
      const model = objs.Model?.[10]
      expect(model?.Vertices).toBeUndefined()
      expect((model?.Lcl_Translation as { value: number[] }).value).toEqual([1, 2, 3])

      const geo = objs.Geometry?.[900000]
      expect(geo?.attrType).toBe('Mesh')
      expect(Array.from((geo?.Vertices as { a: Float64Array }).a)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])

      expect(objs.Video?.[30]?.FileName).toBe('img.png')
      expect(objs.Texture?.[40]?.FileName).toBe('img.png')
      expect(connections(doc)).toContainEqual([20, 900000])
      expect(connections(doc)).toContainEqual([900000, 10])
    })
  })

  describe('ascii-7300-multiple-materials.fbx', () => {
    it('parses Autodesk SDK multi-material scene', () => {
      const doc = parse(loadFixture('ascii-7300-multiple-materials.fbx'))
      expect(doc.format).toBe('ascii')
      expect(doc.version).toBe(7300)

      const objs = objects(doc)
      expect(objs.Geometry?.[1581774000]?.attrType).toBe('Mesh')
      expect((objs.Geometry?.[1581774000]?.Vertices as { a: Float64Array }).a).toHaveLength(24)

      expect(objs.Model?.[1581771968]?.attrName).toBe('Box004')
      expect(objs.Material?.[1581776304]?.attrName).toBe('Material #46')
      expect(Object.keys(objs.Material ?? {})).toHaveLength(4)

      const settings = doc.tree.GlobalSettings as { UnitScaleFactor?: { value: number } }
      expect(settings.UnitScaleFactor?.value).toBe(2.54)

      expect(connections(doc).length).toBeGreaterThan(10)
      expect(connections(doc)).toContainEqual([647590192, 0])
    })
  })

  describe('binary-7400-triangle.fbx', () => {
    it('parses binary triangle with arrays, properties and connections', () => {
      const bytes = loadFixture('binary-7400-triangle.fbx')
      expect(detectFormat(bytes)).toBe('binary')

      const doc = parse(bytes)
      expect(doc.format).toBe('binary')
      expect(doc.version).toBe(7400)

      const objs = objects(doc)
      const geo = objs.Geometry?.[100]
      expect(geo?.attrName).toBe('Triangle')
      expect(geo?.attrType).toBe('Mesh')
      expect(Array.from((geo?.Vertices as { a: Float64Array }).a)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
      expect(Array.from((geo?.PolygonVertexIndex as { a: Float64Array }).a)).toEqual([0, 1, -3])
      expect(Array.from((geo?.Normals as { a: Float64Array }).a)).toEqual([0, 0, 1])

      const model = objs.Model?.[200]
      expect((model?.Lcl_Translation as { value: number[] }).value).toEqual([1, 2, 3])
      expect((model?.Visibility as { value: boolean }).value).toBe(true)
      expect(connections(doc)).toEqual([[100, 200]])
    })
  })

  describe('binary-7500-props.fbx', () => {
    it('reads FBX 7500 64-bit offsets and mixed property types', () => {
      const doc = parse(loadFixture('binary-7500-props.fbx'))
      expect(doc.version).toBe(7500)

      const video = objects(doc).Video?.[9]
      expect(video?.Flag).toBe(-3)
      expect(video?.Scale).toBeCloseTo(1.5)
      expect(new Uint8Array(video?.Blob as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4]))
      expect(video?.Enabled).toBe(false)
      expect((video?.Weights as { a: boolean[] }).a).toEqual([true, false, true])
      expect(Array.from((video?.Times as { a: Float64Array }).a)).toEqual([1, 2, 3])

      const pose = objects(doc).Pose?.[8]
      expect(Array.isArray(pose?.PoseNode)).toBe(true)
      expect((pose?.PoseNode as unknown[]).length).toBe(2)
    })
  })

  describe('binary-6100-embedded.fbx', () => {
    it('normalizes binary FBX 6 embedded geometry', () => {
      const doc = parse(loadFixture('binary-6100-embedded.fbx'))
      expect(doc.version).toBe(6100)

      const objs = objects(doc)
      expect(objs.Model?.[10]?.Vertices).toBeUndefined()
      expect(Array.from((objs.Geometry?.[900000]?.Vertices as { a: Float64Array }).a)).toEqual([0, 0, 0, 1, 0, 0])
      expect((objs.Model?.[10]?.Lcl_Translation as { value: number[] }).value).toEqual([4, 5, 6])
      expect(objs.Video?.[30]?.FileName).toBe('img.png')
      expect(objs.Texture?.[40]?.FileName).toBe('img.png')
      expect(connections(doc)).toContainEqual([20, 900000])
    })
  })

  describe('binary-6000-unsupported.fbx', () => {
    it('rejects versions below 6100', () => {
      expect(() => parse(loadFixture('binary-6000-unsupported.fbx'))).toThrow(FbxError)
      try {
        parse(loadFixture('binary-6000-unsupported.fbx'))
      } catch (error) {
        expect((error as FbxError).code).toBe('UNSUPPORTED_VERSION')
      }
    })
  })

  it('exposes tree sections on FbxTreeData', () => {
    const tree: FbxTreeData = parse(loadFixture('ascii-7400-triangle.fbx')).tree
    expect(tree.Objects).toBeDefined()
    expect(tree.Connections).toBeDefined()
    expect(tree.GlobalSettings).toBeDefined()
  })
})
