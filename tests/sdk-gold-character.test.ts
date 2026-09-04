import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from '../src/parse'
import { buildScene } from '../src/sdk/build-scene'
import type { FbxCluster, FbxDisplayLayer, FbxFileTexture, FbxMesh, FbxNode, FbxSkin, FbxSurfacePhong } from '../src/sdk'
import { fixturePath, loadFixture } from './helpers/load-fixture'

type VecLayer = {
  name: string
  mappingMode: number
  referenceMode: number
  direct: number[]
  index: number[]
}

type Gold = {
  globalSettings: {
    upAxisSign: number
    frontAxisSign: number
    originalUpAxis: number
    unitScale: number
    timeMode: number
    timeProtocol: number
    ambient: number[]
    defaultCamera: string
  }
  rootChildren: string[]
  nodes: Array<{
    path: string
    name: string
    t: number[]
    r: number[]
    s: number[]
    preRotation: number[]
    postRotation: number[]
    rotationPivot: number[]
    scalingPivot: number[]
    rotationOffset: number[]
    scalingOffset: number[]
    geometricTranslation: number[]
    geometricRotation: number[]
    geometricScaling: number[]
    rotationOrder: number
    inheritType: number
    visibility: number
    show: boolean
    children: string[]
    materials: string[]
    attr?: { classId: string; skeletonType?: number }
    udp3dsmax?: string
  }>
  meshes: Array<{
    controlPointCount: number
    verts: number[]
    polygonVertexIndex: number[]
    polygonSizes: number[]
    polygonCount: number
    normals: Array<VecLayer | null>
    tangents: Array<VecLayer | null>
    binormals: Array<VecLayer | null>
    uvs: Array<VecLayer | null>
    vertexColors: Array<VecLayer | null>
    materials: Array<{ mappingMode: number; index: number[] } | null>
  }>
  skins: Array<{
    meshCp: number
    skinningType: number
    clusters: Array<{
      bonePath: string
      linkMode: number
      indexes: number[]
      weights: number[]
      transformLink: number[]
    }>
  }>
  materials: Array<{ name: string; classId: string; props: Record<string, unknown> }>
  textures: Array<{
    file: string
    fileName: string
    relativeFileName: string
    wrapU: number
    wrapV: number
    uvSet: string
  }>
  videos: Array<{ file: string; fileName: string; relativeFileName: string }>
  displayLayers: Array<{ name: string; color: number[]; members: string[] }>
  connections: { op: Array<{ srcFile: string; dstMaterial: string; dstProp: string }>; ooFiltered: number }
}

function maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY
  let m = 0
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs((a[i] ?? 0) - (b[i] ?? 0)))
  return m
}

function numArr(v: unknown): number[] {
  if (v instanceof Float64Array) return Array.from(v)
  if (Array.isArray(v) && v.every((x) => typeof x === 'number')) return v as number[]
  return []
}

function vec3(v: unknown, fallback: number[]): number[] {
  if (Array.isArray(v) && v.length >= 3) return [Number(v[0]), Number(v[1]), Number(v[2])]
  return fallback
}

function propVal(obj: { properties: Array<{ name: string; value: unknown }> }, name: string): unknown {
  return obj.properties.find((p) => p.name === name || p.name.replace(/ /g, '_') === name.replace(/ /g, '_'))?.value
}

function nodePath(node: FbxNode): string {
  if (!node.parent) return node.name
  const same = node.parent.children.filter((c) => c.name === node.name)
  const base = `${nodePath(node.parent)}/${node.name}`
  return same.length > 1 ? `${base}#${same.indexOf(node)}` : base
}

function polygonSizes(pvi: ArrayLike<number>): number[] {
  const sizes: number[] = []
  let n = 0
  for (let i = 0; i < pvi.length; i++) {
    n++
    if ((pvi[i] ?? 0) < 0) {
      sizes.push(n)
      n = 0
    }
  }
  return sizes
}

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

function eqLayer(libDirect: ArrayLike<number>, libIndex: ArrayLike<number> | undefined, gold: VecLayer, label: string) {
  expect(maxAbsDiff(libDirect, gold.direct), `${label} direct`).toBeLessThan(1e-5)
  if (gold.index.length > 0) {
    const idx = libIndex && libIndex.length > 0 ? libIndex : []
    expect(maxAbsDiff(idx, gold.index), `${label} index`).toBeLessThan(1e-9)
  }
}

describe('20269546453281.fbx vs Autodesk SDK gold（全量）', () => {
  it('buildScene 与 SDK dump 全量对齐', () => {
    const gold = JSON.parse(readFileSync(fixturePath('20269546453281.sdk-gold.json'), 'utf8')) as Gold
    const scene = buildScene(parse(loadFixture('20269546453281.fbx')))

    const nodes = scene.members.filter((o): o is FbxNode => o.classId === 'FbxNode')
    const byPath = new Map(nodes.map((n) => [nodePath(n), n]))
    expect(nodes).toHaveLength(gold.nodes.length)
    expect(scene.rootNode.children.map((c) => nodePath(c))).toEqual(gold.rootChildren)

    const gs = scene.globalSettings
    expect(gs.systemUnit.scaleFactor).toBe(gold.globalSettings.unitScale)
    expect(gs.originalUpAxis).toBe(gold.globalSettings.originalUpAxis)
    expect(gs.timeMode).toBe(gold.globalSettings.timeMode)
    expect(gs.timeProtocol).toBe(gold.globalSettings.timeProtocol)
    expect(gs.defaultCamera).toBe(gold.globalSettings.defaultCamera)
    expect(gs.ambientColor?.r).toBeCloseTo(gold.globalSettings.ambient[0]!, 5)
    expect(gs.axisSystem.upSign).toBe(gold.globalSettings.upAxisSign)
    expect(gs.axisSystem.frontSign).toBe(gold.globalSettings.frontAxisSign)

    for (const gn of gold.nodes) {
      const n = byPath.get(gn.path)
      expect(n, `node ${gn.path}`).toBeDefined()
      expect(n!.name).toBe(gn.name)
      expect(maxAbsDiff(vec3(n!.lclTranslation?.value, [0, 0, 0]), gn.t), `${gn.path} T`).toBeLessThan(1e-5)
      expect(maxAbsDiff(vec3(n!.lclRotation?.value, [0, 0, 0]), gn.r), `${gn.path} R`).toBeLessThan(1e-5)
      expect(maxAbsDiff(vec3(n!.lclScaling?.value, [1, 1, 1]), gn.s), `${gn.path} S`).toBeLessThan(1e-5)
      expect(maxAbsDiff(vec3(n!.preRotation?.value, [0, 0, 0]), gn.preRotation)).toBeLessThan(1e-5)
      expect(maxAbsDiff(vec3(n!.postRotation?.value, [0, 0, 0]), gn.postRotation)).toBeLessThan(1e-5)
      expect(maxAbsDiff(vec3(n!.rotationPivot?.value, [0, 0, 0]), gn.rotationPivot)).toBeLessThan(1e-5)
      expect(maxAbsDiff(vec3(n!.scalingPivot?.value, [0, 0, 0]), gn.scalingPivot)).toBeLessThan(1e-5)
      expect(maxAbsDiff(vec3(n!.rotationOffset?.value, [0, 0, 0]), gn.rotationOffset)).toBeLessThan(1e-5)
      expect(maxAbsDiff(vec3(n!.scalingOffset?.value, [0, 0, 0]), gn.scalingOffset)).toBeLessThan(1e-5)
      expect(maxAbsDiff(vec3(n!.geometricTranslation?.value, [0, 0, 0]), gn.geometricTranslation)).toBeLessThan(1e-5)
      expect(maxAbsDiff(vec3(n!.geometricRotation?.value, [0, 0, 0]), gn.geometricRotation)).toBeLessThan(1e-5)
      expect(maxAbsDiff(vec3(n!.geometricScaling?.value, [1, 1, 1]), gn.geometricScaling)).toBeLessThan(1e-5)
      expect(Number(n!.rotationOrder?.value ?? 0)).toBe(gn.rotationOrder)
      expect(Number(n!.inheritType?.value ?? 0)).toBe(gn.inheritType)
      expect(Number(n!.visibility?.value ?? 1)).toBe(gn.visibility)
      expect(Boolean(n!.show?.value ?? true)).toBe(gn.show)
      expect(n!.children.map((c) => nodePath(c)), `${gn.path} children`).toEqual(gn.children)
      expect(n!.materials.map((m) => m.name)).toEqual(gn.materials)
      if (gn.attr?.classId === 'FbxSkeleton') {
        const sk = n!.nodeAttributes.find((a) => a.classId === 'FbxSkeleton')
        expect(sk, `${gn.path} skeleton`).toBeDefined()
        expect((sk as { skeletonType?: number }).skeletonType).toBe(gn.attr.skeletonType)
      }
      if (gn.attr?.classId === 'FbxNull') {
        expect(n!.nodeAttributes.some((a) => a.classId === 'FbxNull'), `${gn.path} null`).toBe(true)
      }
      if (gn.udp3dsmax) {
        expect(String(propVal(n!, 'UDP3DSMAX') ?? '')).toBe(gn.udp3dsmax)
      }
    }

    const meshes = scene.members.filter((o): o is FbxMesh => o.classId === 'FbxMesh')
    expect(meshes).toHaveLength(gold.meshes.length)
    for (const gm of gold.meshes) {
      const mesh = meshes.find((m) => m.controlPoints.length / 3 === gm.controlPointCount)
      expect(mesh, `mesh cp=${gm.controlPointCount}`).toBeDefined()
      expect(maxAbsDiff(mesh!.controlPoints, gm.verts), 'verts').toBeLessThan(1e-9)
      expect(maxAbsDiff(mesh!.polygonIndexes, gm.polygonVertexIndex), 'pvi').toBeLessThan(1e-9)
      expect(polygonSizes(mesh!.polygonIndexes)).toEqual(gm.polygonSizes)
      expect(gm.polygonSizes).toHaveLength(gm.polygonCount)

      const layer = mesh!.layers[0]
      expect(layer, 'layer0').toBeDefined()
      if (gm.normals[0]) {
        eqLayer(numArr(layer!.normals?.directArray), layer!.normals?.indexArray, gm.normals[0], 'normals')
        expect(layer!.normals?.mappingMode).toBe(gm.normals[0].mappingMode)
        expect(layer!.normals?.referenceMode).toBe(gm.normals[0].referenceMode)
      }
      if (gm.tangents[0]) {
        eqLayer(numArr(layer!.tangents?.directArray), layer!.tangents?.indexArray, gm.tangents[0], 'tangents')
        expect(layer!.tangents?.name).toBe(gm.tangents[0].name)
      }
      if (gm.binormals[0]) {
        eqLayer(numArr(layer!.binormals?.directArray), layer!.binormals?.indexArray, gm.binormals[0], 'binormals')
      }
      expect(layer!.uvs).toHaveLength(gm.uvs.length)
      for (let i = 0; i < gm.uvs.length; i++) {
        const gu = gm.uvs[i]!
        const lu = layer!.uvs[i]!
        expect(lu.name).toBe(gu.name)
        eqLayer(numArr(lu.directArray), lu.indexArray, gu, `uv ${gu.name}`)
        expect(lu.mappingMode).toBe(gu.mappingMode)
        expect(lu.referenceMode).toBe(gu.referenceMode)
      }
      if (gm.vertexColors[0]) {
        eqLayer(numArr(layer!.vertexColors?.directArray), layer!.vertexColors?.indexArray, gm.vertexColors[0], 'colors')
      }
      if (gm.materials[0]) {
        const lm = layer!.materials!
        const idx = lm.indexArray && lm.indexArray.length > 0 ? lm.indexArray : numArr(lm.directArray)
        expect(maxAbsDiff(idx, gm.materials[0].index), 'material index').toBeLessThan(1e-9)
        expect(lm.mappingMode).toBe(gm.materials[0].mappingMode)
      }
    }

    for (const gsSkin of gold.skins) {
      const mesh = meshes.find((m) => m.controlPoints.length / 3 === gsSkin.meshCp)
      const skin = mesh?.deformers.find((d): d is FbxSkin => d.classId === 'FbxSkin')
      expect(skin, `skin mesh=${gsSkin.meshCp}`).toBeDefined()
      expect(skin!.skinningType).toBe(gsSkin.skinningType)
      expect(skin!.clusters).toHaveLength(gsSkin.clusters.length)
      const used = new Set<FbxCluster>()
      for (const gc of gsSkin.clusters) {
        const libC = skin!.clusters.find((c) => !used.has(c) && c.link && nodePath(c.link) === gc.bonePath)
        expect(libC, `cluster ${gc.bonePath} on ${gsSkin.meshCp}`).toBeDefined()
        used.add(libC!)
        expect(libC!.linkMode).toBe(gc.linkMode)
        expect(Array.from(libC!.indexes)).toEqual(gc.indexes)
        expect(maxAbsDiff(libC!.weights, gc.weights)).toBeLessThan(1e-7)
        expect(maxAbsDiff(libC!.transformLink ?? [], gc.transformLink)).toBeLessThan(1e-9)
        expect(libC!.transform).toHaveLength(16)
      }
    }

    for (const gm of gold.materials) {
      const lib = scene.materials.find((m) => m.name === gm.name) as FbxSurfacePhong | undefined
      expect(lib, `mat ${gm.name}`).toBeDefined()
      expect(lib!.classId).toBe(gm.classId)
      for (const [key, val] of Object.entries(gm.props)) {
        const got = propVal(lib!, key)
        expect(got, `${gm.name}.${key}`).toBeDefined()
        if (Array.isArray(val)) expect(maxAbsDiff(vec3(got, []), val as number[])).toBeLessThan(1e-5)
        else if (typeof val === 'number') expect(Number(got)).toBeCloseTo(val, 5)
        else expect(got).toBe(val)
      }
    }

    for (const gt of gold.textures) {
      const lib = scene.textures.find((t) => basename((t as FbxFileTexture).fileName ?? '') === gt.file) as
        | FbxFileTexture
        | undefined
      expect(lib, `tex ${gt.file}`).toBeDefined()
      expect(lib!.fileName).toBe(gt.fileName)
      expect(lib!.relativeFileName).toBe(gt.relativeFileName)
      expect(Number(lib!.wrapModeU?.value ?? 0)).toBe(gt.wrapU)
      expect(Number(lib!.wrapModeV?.value ?? 0)).toBe(gt.wrapV)
      expect(String(lib!.uvSet?.value ?? '')).toBe(gt.uvSet)
    }

    for (const gv of gold.videos) {
      const lib = scene.videos.find((v) => basename(v.fileName ?? '') === gv.file)
      expect(lib, `video ${gv.file}`).toBeDefined()
      expect(lib!.fileName).toBe(gv.fileName)
      expect(lib!.relativeFileName).toBe(gv.relativeFileName)
    }

    const layers = scene.members.filter((o): o is FbxDisplayLayer => o.classId === 'FbxDisplayLayer')
    expect(layers).toHaveLength(gold.displayLayers.length)
    for (const gl of gold.displayLayers) {
      const lib = layers.find((l) => l.name === gl.name)
      expect(lib, `layer ${gl.name}`).toBeDefined()
      const color = vec3(propVal(lib!, 'Color'), [])
      expect(maxAbsDiff(color, gl.color), `${gl.name} color`).toBeLessThan(1e-5)
      const memberPaths = lib!.members.filter((m): m is FbxNode => m.classId === 'FbxNode').map((m) => nodePath(m))
      expect([...memberPaths].sort(), `${gl.name} members`).toEqual([...gl.members].sort())
    }

    for (const op of gold.connections.op) {
      const mat = scene.materials.find((m) => m.name === op.dstMaterial)
      expect(mat, op.dstMaterial).toBeDefined()
      const prop = mat!.properties.find((p) => p.name === op.dstProp)
      expect(prop, `${op.dstMaterial}.${op.dstProp}`).toBeDefined()
      const srcNames = (prop!.srcObjects ?? []).map((o) => basename((o as FbxFileTexture).fileName ?? o.name))
      expect(srcNames, `OP ${op.srcFile} -> ${op.dstMaterial}.${op.dstProp}`).toContain(op.srcFile)
    }

    const oo = scene.connections.filter((c) => c.fileKind === 'OO').length
    expect(oo).toBe(gold.connections.ooFiltered)
  }, 60_000)
})
