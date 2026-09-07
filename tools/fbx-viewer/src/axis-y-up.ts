import { FbxAxisUpVector } from '../../../src/sdk/scene'

/** Three.js 是 Y-up。FBX Z-up（UpAxis=2）对齐 three.js FBXLoader：绕 X 转 -90°。 */
export function threeEulerForFbxYUp(upVector: FbxAxisUpVector): [number, number, number] | null {
  if (upVector === FbxAxisUpVector.eZAxis) return [-Math.PI / 2, 0, 0]
  return null
}
