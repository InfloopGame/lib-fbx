import { describe, expect, it } from 'vitest'
import type { FbxClassId, FbxObject } from '../../src/sdk/core'
import {
  FBX_CLASS_IDS,
  isFbxAnimCurve,
  isFbxAnimCurveNode,
  isFbxAnimLayer,
  isFbxAnimStack,
  isFbxClass,
  isFbxCluster,
  isFbxMesh,
  isFbxNode,
  isFbxScene,
  isFbxSkin,
  isFbxSurfacePhong,
} from '../../src/sdk/guards'

type MissingClassId = Exclude<FbxClassId, (typeof FBX_CLASS_IDS)[number]>
const classIdsExhaustive: MissingClassId extends never ? true : MissingClassId = true

function base(classId: FbxClassId): FbxObject {
  return {
    uniqueId: 1,
    name: classId,
    classId,
    objectFlags: 0,
    properties: [],
    srcObjects: [],
    dstObjects: [],
  }
}

describe('sdk classId guards', () => {
  it('FBX_CLASS_IDS 覆盖全部 FbxClassId', () => {
    expect(classIdsExhaustive).toBe(true)
    expect(FBX_CLASS_IDS.length).toBeGreaterThan(70)
    expect(new Set(FBX_CLASS_IDS).size).toBe(FBX_CLASS_IDS.length)
  })

  it('isFbxClass 只在 classId 匹配时为 true', () => {
    for (const classId of FBX_CLASS_IDS) {
      const obj = base(classId)
      expect(isFbxClass(obj, classId)).toBe(true)
      expect(isFbxClass(obj, classId === 'FbxMesh' ? 'FbxNode' : 'FbxMesh')).toBe(false)
    }
  })

  it('具名守卫只收窄对应 classId', () => {
    expect(isFbxScene(base('FbxScene'))).toBe(true)
    expect(isFbxScene(base('FbxNode'))).toBe(false)
    expect(isFbxNode(base('FbxNode'))).toBe(true)
    expect(isFbxMesh(base('FbxMesh'))).toBe(true)
    expect(isFbxMesh(base('FbxNurbs'))).toBe(false)
    expect(isFbxSurfacePhong(base('FbxSurfacePhong'))).toBe(true)
    expect(isFbxSkin(base('FbxSkin'))).toBe(true)
    expect(isFbxCluster(base('FbxCluster'))).toBe(true)
    expect(isFbxAnimStack(base('FbxAnimStack'))).toBe(true)
    expect(isFbxAnimLayer(base('FbxAnimLayer'))).toBe(true)
    expect(isFbxAnimCurveNode(base('FbxAnimCurveNode'))).toBe(true)
    expect(isFbxAnimCurve(base('FbxAnimCurve'))).toBe(true)
  })
})
