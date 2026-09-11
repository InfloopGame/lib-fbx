import { BufferAttribute, BufferGeometry, Group, Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { parse } from '../src/parse'
import { buildScene } from '../src/sdk/build-scene'
import { loadFixture, loadFixtureText } from './helpers/load-fixture'
import { diffSnapshots } from '../tools/fbx-viewer/src/scene-diff'
import { fbxSceneToThree } from '../tools/fbx-viewer/src/fbx-to-three'
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
