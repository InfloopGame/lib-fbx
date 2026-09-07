import { describe, expect, it } from 'vitest'
import { FbxAxisUpVector } from '../src/sdk/scene'
import { threeEulerForFbxYUp } from '../tools/fbx-viewer/src/axis-y-up'

describe('threeEulerForFbxYUp', () => {
  it('rotates Z-up onto Three.js Y-up', () => {
    expect(threeEulerForFbxYUp(FbxAxisUpVector.eZAxis)).toEqual([-Math.PI / 2, 0, 0])
  })

  it('leaves Y-up and X-up unchanged', () => {
    expect(threeEulerForFbxYUp(FbxAxisUpVector.eYAxis)).toBeNull()
    expect(threeEulerForFbxYUp(FbxAxisUpVector.eXAxis)).toBeNull()
  })
})
