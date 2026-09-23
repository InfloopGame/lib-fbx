import { Bone, DoubleSide, Group, Matrix4, SkinnedMesh, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { bindSkin, createPhongMaterial } from '../tools/fbx-viewer/src/fbx-three-common'
import {
  buildMeshGeometry,
  buildSkinInfluences,
  polygons,
  sampleLayer,
  type LayerData,
} from '../tools/fbx-viewer/src/fbx-three-geometry'

const triangle = {
  controlPoints: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  polygonIndexes: [0, 1, -3],
}

function layer(direct: number[], comps: number, mapping: LayerData['mapping'] = 'ByPolygonVertex'): LayerData {
  return { direct, comps, mapping, indexed: false }
}

describe('shared layer sampling', () => {
  it.each([
    ['ByControlPoint', [20, 21]],
    ['ByPolygonVertex', [30, 31]],
    ['ByPolygon', [40, 41]],
    ['AllSame', [10, 11]],
  ] as const)('samples %s without an index array', (mapping, expected) => {
    expect(sampleLayer(layer([10, 11, 20, 21, 30, 31, 40, 41], 2, mapping), 1, 2, 3)).toEqual(expected)
  })

  it('resolves indexed values, falls back to the slot for missing indices and fills missing components', () => {
    const indexed = { ...layer([10, 11, 20, 21], 2), indexed: true, index: [1, 0] }
    expect(sampleLayer(indexed, 0, 0, 0)).toEqual([20, 21])
    expect(sampleLayer(indexed, 0, 1, 0)).toEqual([10, 11])
    expect(sampleLayer({ ...indexed, index: [] }, 0, 1, 0)).toEqual([20, 21])
    expect(sampleLayer(indexed, 0, 2, 0)).toEqual([0, 0])
    expect(sampleLayer(null, 0, 0, 0)).toEqual([])
  })
})

describe('shared geometry construction', () => {
  it('decodes polygon terminators while keeping original polygon-vertex offsets', () => {
    expect(polygons([0, -2, 0, 1, 2, -4, 4, 5, -7, 8])).toEqual([
      { cps: [0, 1, 2, 3], pvis: [2, 3, 4, 5] },
      { cps: [4, 5, 6], pvis: [6, 7, 8] },
    ])
  })

  it('expands a quad and a triangle with UVs, colors, skin attributes and material groups', () => {
    const geo = buildMeshGeometry({
      controlPoints: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
      polygonIndexes: [0, 1, 2, -4, 0, 2, -4],
      normals: layer([0, 0, 1], 3, 'AllSame'),
      uvs: layer([0, 0, 1, 0, 1, 1, 0, 1, 0.5, 0.5, 0.75, 0.5, 0.5, 0.75], 2),
      uv2: { ...layer([1, 1, 0, 0], 2), indexed: true, index: [0, 1, 0, 1, 0, 1, 0] },
      colors: layer([1, 0, 0, 0.5, 0, 1, 0, 1], 4, 'ByPolygon'),
      materials: layer([2, 1], 1, 'ByPolygon'),
      influences: [[[7, 0.25], [2, 0.75]], [], [[3, 1]], []],
    })!
    expect(geo.index).toBeNull()
    expect(Array.from(geo.getAttribute('position').array)).toEqual([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0,
      0, 0, 0, 1, 1, 0, 0, 1, 0,
    ])
    expect(Array.from(geo.getAttribute('uv').array)).toEqual([
      0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0.5, 0.5, 0.75, 0.5, 0.5, 0.75,
    ])
    expect(Array.from(geo.getAttribute('uv2').array)).toEqual([
      1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1,
    ])
    expect(Array.from(geo.getAttribute('normal').array)).toEqual(Array.from({ length: 9 }, () => [0, 0, 1]).flat())
    expect(Array.from(geo.getAttribute('color').array)).toEqual([
      ...Array.from({ length: 6 }, () => [1, 0, 0]).flat(),
      ...Array.from({ length: 3 }, () => [0, 1, 0]).flat(),
    ])
    expect(geo.getAttribute('skinIndex').array).toBeInstanceOf(Uint16Array)
    expect(Array.from(geo.getAttribute('skinIndex').array).slice(0, 12)).toEqual([7, 2, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0])
    expect(Array.from(geo.getAttribute('skinWeight').array).slice(0, 12)).toEqual([0.25, 0.75, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])
    expect(geo.groups).toEqual([
      { start: 0, count: 6, materialIndex: 2 },
      { start: 6, count: 3, materialIndex: 1 },
    ])
  })

  it('coalesces adjacent material groups and omits absent optional attributes', () => {
    const geo = buildMeshGeometry({ ...triangle, polygonIndexes: [0, 1, -3, 0, 1, -3] })!
    expect(geo.groups).toEqual([{ start: 0, count: 6, materialIndex: 0 }])
    expect(Object.keys(geo.attributes)).toEqual(['position', 'normal'])
    expect(Array.from(geo.getAttribute('normal').array)).toEqual(Array.from({ length: 6 }, () => [0, 0, 1]).flat())
  })

  it('only bakes geometric transforms when requested, transforming normals by the normal matrix', () => {
    const data = { ...triangle, normals: layer([1, 1, 0], 3, 'AllSame') }
    const transform = new Matrix4().makeScale(2, 1, 1).setPosition(5, 6, 7)
    const local = buildMeshGeometry(data)!
    const baked = buildMeshGeometry(data, transform)!
    expect(Array.from(local.getAttribute('position').array)).toEqual(triangle.controlPoints)
    expect(Array.from(local.getAttribute('normal').array).slice(0, 3)).toEqual([1, 1, 0])
    expect(Array.from(baked.getAttribute('position').array)).toEqual([5, 6, 7, 7, 6, 7, 5, 7, 7])
    expect(baked.getAttribute('normal').getX(0)).toBeCloseTo(1 / Math.sqrt(5))
    expect(baked.getAttribute('normal').getY(0)).toBeCloseTo(2 / Math.sqrt(5))
    expect(data.controlPoints).toEqual(triangle.controlPoints)
    expect(data.normals.direct).toEqual([1, 1, 0])
  })

  it('computes missing normals after baking and rejects geometry without complete faces', () => {
    const geo = buildMeshGeometry(triangle, new Matrix4().makeScale(-2, 3, 1))!
    expect(geo.getAttribute('normal').getZ(0)).toBe(-1)
    expect(buildMeshGeometry({ controlPoints: [], polygonIndexes: [] })).toBeNull()
    expect(buildMeshGeometry({ ...triangle, polygonIndexes: [0, 1, 2] })).toBeNull()
    expect(buildMeshGeometry({ ...triangle, polygonIndexes: [0, -2] })).toBeNull()
  })
})

describe('shared skinning', () => {
  it('keeps the strongest four weights, normalizes them, and preserves supplied bone indices', () => {
    const clusters = [1, 2, 3, 4, 5].map((weight, i) => ({ boneIndex: 10 + i, indices: [0], weights: [weight] }))
    clusters.push({ boneIndex: 99, indices: [-1, 2, 1, 0], weights: [1, 1, 0] })
    const influences = buildSkinInfluences(clusters, 2)
    expect(influences[0]?.map(([bone]) => bone)).toEqual([14, 13, 12, 11])
    expect(influences[0]?.map(([, weight]) => weight)).toEqual([5 / 14, 4 / 14, 3 / 14, 2 / 14])
    expect(influences[1]).toEqual([])
    expect(buildSkinInfluences([], 0)).toEqual([])
  })

  it('preserves stable ties and separate entries that map to the same bone', () => {
    expect(buildSkinInfluences([
      { boneIndex: 4, indices: [0], weights: [1] },
      { boneIndex: 4, indices: [0], weights: [1] },
      { boneIndex: 2, indices: [0], weights: [1] },
    ], 1)).toEqual([[[4, 1 / 3], [4, 1 / 3], [2, 1 / 3]]])
  })

  it('keeps per-skin inverse bind matrices when two meshes share a moving bone', () => {
    const root = new Group()
    const bone = new Bone()
    bone.position.x = 7
    const geo = buildMeshGeometry({ ...triangle, influences: [[[0, 1]], [[0, 1]], [[0, 1]]] })!
    const a = new SkinnedMesh(geo)
    const b = new SkinnedMesh(geo)
    a.position.x = 2
    b.position.x = 3
    root.add(bone, a, b)
    root.updateMatrixWorld(true)
    const linkA = new Matrix4().makeTranslation(5, 0, 0).elements
    const linkB = new Matrix4().makeTranslation(6, 0, 0).elements
    bindSkin(a, { bones: [bone], transformLinks: [linkA] })
    bindSkin(b, { bones: [bone], transformLinks: [linkB] })
    expect(a.skeleton.bones[0]).toBe(b.skeleton.bones[0])
    expect(a.skeleton.boneInverses[0]?.elements[12]).toBe(-5)
    expect(b.skeleton.boneInverses[0]?.elements[12]).toBe(-6)
    expect(a.bindMatrix.elements[12]).toBe(2)
    expect(b.bindMatrix.elements[12]).toBe(3)
    expect(linkA[12]).toBe(5)
    expect(linkB[12]).toBe(6)
    for (const mesh of [a, b]) {
      expect(mesh.getVertexPosition(0, new Vector3()).applyMatrix4(mesh.matrixWorld).x).toBe(4)
    }
    bone.position.x += 3
    root.updateMatrixWorld(true)
    for (const mesh of [a, b]) {
      expect(mesh.getVertexPosition(0, new Vector3()).applyMatrix4(mesh.matrixWorld).x).toBe(7)
    }
  })

  it('uses the current bone transform only when TransformLink is absent, and supports empty skins', () => {
    const bone = new Bone()
    bone.position.x = 7
    bone.updateMatrixWorld(true)
    const mesh = new SkinnedMesh(buildMeshGeometry(triangle)!)
    bindSkin(mesh, { bones: [bone], transformLinks: [undefined] })
    expect(mesh.skeleton.boneInverses[0]?.elements[12]).toBe(-7)
    bindSkin(mesh, { bones: [], transformLinks: [] })
    expect(mesh.skeleton.bones).toEqual([])
    expect(mesh.skeleton.boneInverses).toEqual([])
  })
})

describe('shared Phong material construction', () => {
  it.each([0, 0.25, 1])('preserves color, shading and existing transparency behavior (%s)', (transparency) => {
    const mat = createPhongMaterial({
      name: 'TestMaterial',
      diffuse: [0.2, 0.4, 0.6],
      specular: [0.1, 0.2, 0.3],
      shininess: 24,
      transparency,
      vertexColors: true,
    })
    expect(mat.name).toBe('TestMaterial')
    expect(mat.color.toArray()).toEqual([0.2, 0.4, 0.6])
    expect(mat.specular.toArray()).toEqual([0.1, 0.2, 0.3])
    expect(mat.shininess).toBe(24)
    expect(mat.vertexColors).toBe(true)
    expect(mat.side).toBe(DoubleSide)
    expect(mat.transparent).toBe(transparency === 0.25)
    expect(mat.opacity).toBe(transparency === 0.25 ? 0.75 : 1)
  })
})
