import { Matrix4, SkinnedMesh, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { buildScene, parse } from '../../src'
import { fbxSceneToThree } from '../../tools/fbx-viewer/src/fbx-to-three'
import type { FbxMesh, FbxSkin } from '../../src/sdk'
import { loadFixture } from '../helpers/load-fixture'

function maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let m = 0
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs((a[i] ?? 0) - (b[i] ?? 0)))
  return m
}

describe('fbx skin bind', () => {
  it('TransformLink inverse + mesh.matrixWorld，不走 bind(undefined)', () => {
    const fbx = buildScene(parse(loadFixture('20269546453281.fbx')))
    const { meshes } = fbxSceneToThree(fbx)
    const skinned = meshes.filter((m): m is SkinnedMesh => m instanceof SkinnedMesh)
    expect(skinned.length).toBe(2)

    const fbxMeshes = fbx.members.filter((o): o is FbxMesh => o.classId === 'FbxMesh')
    for (const src of fbxMeshes) {
      const skin = src.deformers.find((d): d is FbxSkin => d.classId === 'FbxSkin')
      expect(skin).toBeDefined()
      const nBones = skin!.clusters.filter((c) => c.link).length
      const mesh = skinned.find((m) => m.skeleton.bones.length === nBones)
      expect(mesh, `skinned cp=${src.controlPoints.length / 3}`).toBeDefined()

      const identity = new Matrix4()
      expect(mesh!.bindMatrix.equals(identity), `${mesh!.name} bindMatrix`).toBe(false)
      expect(maxAbsDiff(mesh!.bindMatrix.elements, mesh!.matrixWorld.elements)).toBeLessThan(1e-8)

      const first = skin!.clusters.find((c) => c.transformLink && c.link)
      expect(first?.transformLink).toBeDefined()
      const expected = new Matrix4().fromArray(Array.from(first!.transformLink!)).invert()
      expect(
        maxAbsDiff(mesh!.skeleton.boneInverses[0]!.elements, expected.elements),
        `${mesh!.name} boneInverse0`,
      ).toBeLessThan(1e-5)
    }
  })

  it('场景姿势：Head 对齐 Nail，不落在 TransformLink 原点', () => {
    const fbx = buildScene(parse(loadFixture('20269546453281.fbx')))
    const { root, bones } = fbxSceneToThree(fbx)
    root.updateMatrixWorld(true)
    const head = bones.find((b) => b.name === 'Bip001 Head')
    expect(head).toBeDefined()
    const p = new Vector3().setFromMatrixPosition(head!.matrixWorld)
    let nail: Vector3 | undefined
    root.traverse((o: { name: string; matrixWorld: object }) => {
      if (o.name.includes('Nail') && o.name.includes('Head') && !nail) {
        nail = new Vector3().setFromMatrixPosition(o.matrixWorld as never)
      }
    })
    expect(nail, 'Nail_Bip001_Head').toBeDefined()
    expect(p.distanceTo(nail!), `head=${p.toArray()} nail=${nail!.toArray()}`).toBeLessThan(8)
    expect(p.z).toBeGreaterThan(150)
  })
})
