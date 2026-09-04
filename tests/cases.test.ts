import { describe, expect, it } from 'vitest'
import { detectFormat } from '../src/detect'
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

  describe('binary-7400-character.fbx', () => {
    it('matches Autodesk SDK 2020.2.1 dump of a skinned character', () => {
      const doc = parse(loadFixture('20269546453281.fbx'))
      expect(doc.format).toBe('binary')
      expect(doc.version).toBe(7400)

      const objs = objects(doc)
      const models = objs.Model ?? {}
      const geos = Object.values(objs.Geometry ?? {})
      const deformers = Object.values(objs.Deformer ?? {})
      const nodeAttrs = Object.values(objs.NodeAttribute ?? {})

      expect(Object.keys(models)).toHaveLength(163)
      expect(geos).toHaveLength(2)
      expect(Object.keys(objs.Material ?? {})).toHaveLength(3)
      expect(Object.keys(objs.Texture ?? {})).toHaveLength(2)
      expect(Object.keys(objs.Video ?? {})).toHaveLength(2)
      expect(Object.keys(objs.CollectionExclusive ?? {})).toHaveLength(8)
      expect(deformers.filter((d) => d.attrType === 'Skin')).toHaveLength(2)
      expect(deformers.filter((d) => d.attrType === 'Cluster')).toHaveLength(92)
      expect(nodeAttrs.filter((n) => n.attrType === 'LimbNode')).toHaveLength(106)
      expect(nodeAttrs.filter((n) => n.attrType === 'Root')).toHaveLength(1)
      expect(nodeAttrs.filter((n) => n.attrType === 'Null')).toHaveLength(52)
      expect(connections(doc)).toHaveLength(680)

      const modelByName = Object.fromEntries(Object.values(models).map((m) => [String(m.attrName), m]))
      expect(modelByName.Bip001?.attrType).toBe('Root')
      expect(modelByName.Root?.attrType).toBe('Null')
      expect(modelByName.Sys_Bind?.attrType).toBe('Null')
      expect(modelByName.Sys_Mesh?.attrType).toBe('Null')

      expect(Object.values(objs.Material ?? {}).map((m) => m.attrName).sort()).toEqual([
        'Mat_MuslcMan_Body',
        'Mat_MuslcMan_Face',
        'lambert1',
      ])
      expect(Object.values(objs.CollectionExclusive ?? {}).map((l) => l.attrName)).toEqual([
        'Lay_Mesh_Com',
        'BoneColliders',
        'Lay_Com_裸模',
        'Lay_MDB_Com',
        'Lay_Bip_Com',
        'Lay_Bone_Com',
        'Lay_Ctrl_Com',
        'Lay_Help_Com',
      ])

      const settings = doc.tree.GlobalSettings as {
        UnitScaleFactor?: { value: number }
        UpAxis?: { value: number }
        TimeMode?: { value: number }
      }
      expect(settings.UnitScaleFactor?.value).toBe(1)
      expect(settings.UpAxis?.value).toBe(2)
      expect(settings.TimeMode?.value).toBe(3)

      const byVerts = Object.fromEntries(
        geos.map((g) => [(g.Vertices as { a: Float64Array }).a.length, g]),
      )
      const body = byVerts[18090]
      const extra = byVerts[10632]
      expect(body).toBeDefined()
      expect(extra).toBeDefined()
      expect(body!.attrType).toBe('Mesh')
      expect(extra!.attrType).toBe('Mesh')

      const bodyV = (body!.Vertices as { a: Float64Array }).a
      const bodyP = (body!.PolygonVertexIndex as { a: Float64Array }).a
      expect(bodyP).toHaveLength(35358)
      expect(Array.from(bodyV.subarray(0, 6))).toEqual([
        4.948276353554035e-14, 176.060546875, 5.964886665344238,
        4.961960679036696e-14, 176.1625518798828, 5.3778791427612305,
      ])
      expect(Array.from(bodyV.subarray(-6))).toEqual([
        3.9170737266540527, 184.26710510253906, 9.535456657409668,
        -3.9170732498168945, 184.26710510253906, 9.535456657409668,
      ])
      expect(Array.from(bodyP.subarray(0, 8))).toEqual([12, 0, -12, 0, 1, -12, 3, 14])
      expect(Array.from(bodyP.subarray(-8))).toEqual([1415, -6028, 1386, 1395, -6029, 1405, 1404, -6030])

      const bodyUv = Object.values(body!.LayerElementUV as Record<string, Record<string, unknown>>)
      expect(bodyUv.map((u) => u.Name)).toEqual(['map1', 'UVChannel_2'])
      expect((bodyUv[0]!.UV as { a: Float64Array }).a).toHaveLength(14592)
      expect((bodyUv[0]!.UVIndex as { a: Float64Array }).a).toHaveLength(35358)
      expect((bodyUv[1]!.UV as { a: Float64Array }).a).toHaveLength(58028)
      const bodyN = Object.values(body!.LayerElementNormal as Record<string, Record<string, unknown>>)[0]!
      expect(bodyN.MappingInformationType).toBe('ByPolygonVertex')
      expect(bodyN.ReferenceInformationType).toBe('Direct')
      expect((bodyN.Normals as { a: Float64Array }).a).toHaveLength(106074)

      const extraV = (extra!.Vertices as { a: Float64Array }).a
      const extraP = (extra!.PolygonVertexIndex as { a: Float64Array }).a
      expect(extraP).toHaveLength(21060)
      expect(Array.from(extraV.subarray(0, 6))).toEqual([
        17.01272201538086, 161.5990753173828, 4.690326690673828,
        16.608806610107422, 162.0055389404297, -13.824787139892578,
      ])
      expect(Array.from(extraP.subarray(0, 8))).toEqual([53, 2649, -1751, 2649, 53, -1748, 1747, 1748])
      const extraUv = Object.values(extra!.LayerElementUV as Record<string, Record<string, unknown>>)
      expect(extraUv.map((u) => u.Name)).toEqual(['map1'])
      expect((extraUv[0]!.UV as { a: Float64Array }).a).toHaveLength(9778)
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
