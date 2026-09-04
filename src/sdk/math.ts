/** FBX SDK 风格数学类型（仅数据，不含运算）。矩阵为行主序 16 元。 */

export type FbxDouble2 = readonly [number, number]
export type FbxDouble3 = readonly [number, number, number]
export type FbxDouble4 = readonly [number, number, number, number]
export type FbxDouble4x4 = readonly [
  FbxDouble4,
  FbxDouble4,
  FbxDouble4,
  FbxDouble4,
]

export interface FbxVector2 {
  readonly x: number
  readonly y: number
}

export interface FbxVector4 {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly w: number
}

export interface FbxQuaternion {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly w: number
}

export interface FbxColor {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

/** 4×4 矩阵，行主序 16 个 number，与 FBX SDK FbxMatrix 存储一致。 */
export type FbxMatrix = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
]

/** 仿射矩阵，存储同 {@link FbxMatrix}。 */
export type FbxAMatrix = FbxMatrix

export enum FbxEulerOrder {
  eOrderXYZ = 0,
  eOrderXZY,
  eOrderYZX,
  eOrderYXZ,
  eOrderZXY,
  eOrderZYX,
  eOrderSphericXYZ,
}

export type EFbxRotationOrder = FbxEulerOrder

export enum EFbxQuatInterpMode {
  eQuatInterpOff = 0,
  eQuatInterpClassic,
  eQuatInterpSlerp,
  eQuatInterpCubic,
  eQuatInterpTangentDependent,
  eQuatInterpCount,
}

export enum FbxInheritType {
  eInheritRrSs = 0,
  eInheritRSrs,
  eInheritRrs,
}
