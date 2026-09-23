import { Bone, BufferAttribute, BufferGeometry, Group, Mesh, SkinnedMesh, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { parse } from '../src/parse'
import { buildScene } from '../src/sdk/build-scene'
import { loadFixture, loadFixtureText } from './helpers/load-fixture'
import { diffSnapshots } from '../tools/fbx-viewer/src/scene-diff'
import { fbxSceneToThree } from '../tools/fbx-viewer/src/fbx-sdk-to-three'
import { fbxTreeToThree } from '../tools/fbx-viewer/src/fbx-tree-to-three'
import { snapshotScene } from '../tools/fbx-viewer/src/scene-snapshot'

function tri(): BufferGeometry {
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3))
  return geo
}

describe('snapshotScene', () => {
  it('records name path, type, world matrix and vertex count', () => {
    const root = new Group()
    root.name = 'RootNode'
    const mesh = new Mesh(tri())
    mesh.name = 'Triangle'
    mesh.position.set(1, 2, 3)
    root.add(mesh)
    root.updateMatrixWorld(true)

    const snap = snapshotScene(root)
    expect(snap.nodes.map((n) => n.path)).toEqual(['RootNode', 'RootNode/Triangle'])
    const triNode = snap.nodes[1]
    expect(triNode?.kind).toBe('Mesh')
    expect(triNode?.vertexCount).toBe(3)
    expect(triNode?.world[12]).toBeCloseTo(1)
    expect(triNode?.world[13]).toBeCloseTo(2)
    expect(triNode?.world[14]).toBeCloseTo(3)
  })

  it('folds a Group with a single Mesh child into one Mesh node', () => {
    const root = new Group()
    root.name = 'RootNode'
    const model = new Group()
    model.name = 'Triangle'
    model.position.set(1, 0, 0)
    const mesh = new Mesh(tri())
    mesh.name = 'Geo'
    model.add(mesh)
    root.add(model)
    root.updateMatrixWorld(true)

    const snap = snapshotScene(root)
    expect(snap.nodes.map((n) => n.path)).toEqual(['RootNode', 'RootNode/Triangle'])
    expect(snap.nodes[1]?.kind).toBe('Mesh')
    expect(snap.nodes[1]?.vertexCount).toBe(3)
    expect(snap.nodes[1]?.world[12]).toBeCloseTo(1)
  })
})

describe('diffSnapshots', () => {
  it('reports no mismatches for identical scenes', () => {
    const root = new Group()
    root.name = 'RootNode'
    root.add(new Mesh(tri()).translateX(1))
    root.children[0]!.name = 'Triangle'
    root.updateMatrixWorld(true)
    const snap = snapshotScene(root)
    expect(diffSnapshots(snap, snap)).toEqual([])
  })

  it('reports a world-matrix mismatch on the same path', () => {
    const a = new Group()
    a.name = 'RootNode'
    const ma = new Mesh(tri())
    ma.name = 'Triangle'
    a.add(ma)
    a.updateMatrixWorld(true)

    const b = new Group()
    b.name = 'RootNode'
    const mb = new Mesh(tri())
    mb.name = 'Triangle'
    mb.position.set(4, 0, 0)
    b.add(mb)
    b.updateMatrixWorld(true)

    const diffs = diffSnapshots(snapshotScene(a), snapshotScene(b))
    expect(diffs.some((d) => d.path === 'RootNode/Triangle' && d.field === 'world')).toBe(true)
  })
})

describe('fbxTreeToThree', () => {
  it('builds a named triangle mesh from the parse tree', () => {
    const doc = parse(loadFixtureText('ascii-7400-triangle.fbx'))
    const { root, meshes, stats } = fbxTreeToThree(doc.tree)
    expect(root.name).toBe('RootNode')
    expect(meshes).toHaveLength(1)
    expect(meshes[0]?.name).toBe('Triangle')
    expect(stats.triangles).toBe(1)
    const snap = snapshotScene(root)
    const triNode = snap.nodes.find((n) => n.path === 'RootNode/Triangle')
    expect(triNode?.kind).toBe('Mesh')
    expect(triNode?.vertexCount).toBe(3)
    expect(triNode?.world[12]).toBeCloseTo(1)
    expect(triNode?.world[13]).toBeCloseTo(2)
    expect(triNode?.world[14]).toBeCloseTo(3)
  })

  it.each([1, 2])('keeps bones shared by multiple skins in the scene (UpAxis=%i)', (upAxis) => {
    const property = (value: unknown) => ({ type: 'Vector3D', value })
    const triangle = {
      attrType: 'Mesh',
      Vertices: { a: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
      PolygonVertexIndex: { a: new Float64Array([0, 1, -3]) },
    }
    const cluster = {
      attrType: 'Cluster',
      Indexes: { a: new Float64Array([0, 1, 2]) },
      Weights: { a: new Float64Array([1, 1, 1]) },
      TransformLink: { a: new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1]) },
    }
    const result = fbxTreeToThree({
      GlobalSettings: { UpAxis: property(upAxis) },
      Objects: {
        Model: {
          1: { id: 1, attrName: 'SharedBone', attrType: 'LimbNode', Lcl_Translation: property([5, 0, 0]) },
          2: { id: 2, attrName: 'MeshA', attrType: 'Mesh' },
          3: { id: 3, attrName: 'MeshB', attrType: 'Mesh' },
        },
        Geometry: { 10: { id: 10, ...triangle }, 11: { id: 11, ...triangle } },
        Deformer: {
          20: { id: 20, attrType: 'Skin' },
          21: { id: 21, attrType: 'Skin' },
          30: { id: 30, ...cluster },
          31: { id: 31, ...cluster },
        },
      },
      Connections: {
        connections: [[10, 2], [11, 3], [20, 10], [21, 11], [30, 20], [31, 21], [1, 30], [1, 31]],
      },
    })
    const [a, b] = result.meshes as SkinnedMesh[]
    expect(a).toBeInstanceOf(SkinnedMesh)
    expect(b).toBeInstanceOf(SkinnedMesh)
    const bone = a!.skeleton.bones[0]!
    expect(bone).toBe(b!.skeleton.bones[0])
    expect(bone.parent).toBe(result.root)
    const sceneBones: Bone[] = []
    result.root.traverse((obj) => { if (obj instanceof Bone) sceneBones.push(obj) })
    expect(sceneBones).toEqual([bone])

    const worldVertex = (mesh: SkinnedMesh, index: number) =>
      mesh.getVertexPosition(index, new Vector3()).applyMatrix4(mesh.matrixWorld)
    const before = worldVertex(a!, 0)
    bone.position.y += 3
    result.root.updateMatrixWorld(true)
    for (let i = 0; i < 3; i++) {
      expect(worldVertex(a!, i).distanceTo(worldVertex(b!, i))).toBeLessThan(1e-6)
    }
    expect(worldVertex(a!, 0).distanceTo(before)).toBeCloseTo(3)
  })
})

describe('sdk vs parse', () => {
  function compare(name: string, bytes: Buffer | string): void {
    const doc = parse(bytes)
    const fromSdk = fbxSceneToThree(buildScene(doc))
    const fromTree = fbxTreeToThree(doc.tree)
    const diffs = diffSnapshots(snapshotScene(fromSdk.root), snapshotScene(fromTree.root))
    expect(diffs, `${name}\n${diffs.map((d) => `${d.path} ${d.field}`).join('\n')}`).toEqual([])
  }

  it('agrees on ascii-7400-triangle', () => {
    compare('ascii-7400-triangle', loadFixtureText('ascii-7400-triangle.fbx'))
  })

  it('agrees on ascii-6100-embedded', () => {
    compare('ascii-6100-embedded', loadFixture('ascii-6100-embedded.fbx'))
  })

  it('agrees on ascii-7300-multiple-materials', () => {
    compare('ascii-7300-multiple-materials', loadFixture('ascii-7300-multiple-materials.fbx'))
  })

  it('agrees on binary-7400-triangle', () => {
    compare('binary-7400-triangle', loadFixture('binary-7400-triangle.fbx'))
  })
})
