import { Bone, Matrix4, SkinnedMesh, Vector3 } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { describe, expect, it } from 'vitest'
import { parse } from '../src/parse'
import { buildScene } from '../src/sdk/build-scene'
import { fbxSceneToThree } from '../tools/fbx-viewer/src/fbx-sdk-to-three'
import { fbxTreeToThree } from '../tools/fbx-viewer/src/fbx-tree-to-three'
import { loadFixture } from './helpers/load-fixture'

const converters = [
  { name: 'parse', convert: (doc: ReturnType<typeof parse>) => fbxTreeToThree(doc.tree) },
  { name: 'SDK', convert: (doc: ReturnType<typeof parse>) => fbxSceneToThree(buildScene(doc)) },
]

function legacyDocument() {
  return parse(loadFixture('legacy-skinned-triangle.fbx'))
}

describe.each(converters)('FBX 6.1 skinning through $name', ({ convert }) => {
  it('preserves named and numeric IDs, typed weights and independently cloned skinning', () => {
    const doc = legacyDocument()
    const before = structuredClone(doc.tree)
    expect(doc.version).toBe(6100)
    expect(doc.tree.Objects?.Model?.Body?.id).toBe('Body')
    expect(doc.tree.Objects?.Model?.[1]?.id).toBe(1)
    expect(doc.tree.Objects?.Deformer?.['Cluster Bone']?.Weights?.a).toBeInstanceOf(Float64Array)
    const result = convert(doc)
    expect(doc.tree).toEqual(before)
    expect(result.stats.meshes).toBe(1)
    expect(result.stats.bones).toBe(1)
    expect(result.stats.clusters).toBe(1)

    const cloned = clone(result.root)
    for (const root of [cloned, result.root]) {
      expect(root.getObjectByName('Body')).toBeDefined()
      expect(root.getObjectByName('NumericNode')).toBeDefined()
      const meshes: SkinnedMesh[] = []
      root.traverse((obj) => { if (obj instanceof SkinnedMesh) meshes.push(obj) })
      expect(meshes).toHaveLength(1)
      const mesh = meshes[0]!
      expect(mesh.skeleton.bones).toHaveLength(1)
      expect(mesh.skeleton.bones[0]?.name).toBe('Bone')
      expect(mesh.geometry.getAttribute('position').count).toBe(3)
      expect(Array.from(mesh.geometry.getAttribute('skinWeight').array))
        .toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])
      root.updateMatrixWorld(true)
      for (let i = 0; i < 3; i++) {
        expect(mesh.getVertexPosition(i, new Vector3()).toArray())
          .toEqual([[0, 0, 0], [1, 0, 0], [0, 1, 0]][i])
      }
      mesh.skeleton.bones[0]!.position.x += 25
      root.updateMatrixWorld(true)
      for (let i = 0; i < 3; i++) {
        expect(mesh.getVertexPosition(i, new Vector3()).toArray())
          .toEqual([[25, 0, 0], [26, 0, 0], [25, 1, 0]][i])
      }
    }
  })

  it.each([false, true])('resolves named BindPose references (array=%s)', (asArray) => {
    const doc = legacyDocument()
    doc.tree.Objects!.Model!.RootBone = { id: 'RootBone', attrName: 'RootBone', attrType: 'Root' }
    const connections = doc.tree.Connections!.connections!
    const boneParent = connections.find(([from, to]) => from === 'Bone' && to === 'Scene')!
    boneParent[1] = 'RootBone'
    connections.push(['RootBone', 'Scene'])
    const pose = doc.tree.Objects!.Pose!.BindPose!
    const entry = { Node: 'RootBone', Matrix: { a: new Float64Array(new Matrix4().makeTranslation(5, 0, 0).elements) } }
    pose.PoseNode = asArray ? [entry] : entry
    pose.NbPoseNodes = 1
    const root = convert(doc).root
    expect(root.getObjectByName('RootBone')).toBeInstanceOf(Bone)
    expect(root.getObjectByName('RootBone')!.matrixWorld.elements[12]).toBeCloseTo(5)
    expect(root.getObjectByName('Bone')!.parent).toBe(root.getObjectByName('RootBone'))
    expect(root.getObjectByName('Bone')!.matrixWorld.elements[12]).toBeCloseTo(5)
  })
})

describe('unused skin deformers', () => {
  it('ignores an unconnected skin before classifying its linked mesh as a bone', () => {
    const doc = legacyDocument()
    doc.tree.Objects!.Deformer!['Unused Skin'] = { id: 'Unused Skin', attrType: 'Skin' }
    doc.tree.Objects!.Deformer!['Unused Cluster'] = {
      ...doc.tree.Objects!.Deformer!['Cluster Bone'],
      id: 'Unused Cluster',
    }
    doc.tree.Connections!.connections!.push(
      ['Unused Cluster', 'Unused Skin'],
      ['Body', 'Unused Cluster'],
    )
    const result = fbxTreeToThree(doc.tree)
    expect(result.root.getObjectByName('Body')).toBeInstanceOf(SkinnedMesh)
    expect(result.stats.meshes).toBe(1)
    expect(result.stats.bones).toBe(1)
    expect(result.stats.clusters).toBe(1)
    expect((result.meshes[0] as SkinnedMesh).skeleton.bones[0]?.name).toBe('Bone')
  })
})
