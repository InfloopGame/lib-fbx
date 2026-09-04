import type { FbxDouble3 } from './math'
import type { FbxCollection, FbxObject, FbxProperty, FbxTime } from './core'

export enum FbxAnimTangentMode {
  eTangentAuto = 0x00000100,
  eTangentTCB = 0x00000200,
  eTangentUser = 0x00000400,
  eTangentGenericBreak = 0x00000800,
  eTangentGenericClamp = 0x00001000,
  eTangentGenericTimeIndependent = 0x00002000,
}

export enum FbxAnimInterpolation {
  eInterpolationConstant = 0x00000002,
  eInterpolationLinear = 0x00000004,
  eInterpolationCubic = 0x00000008,
}

export enum FbxAnimWeightedMode {
  eWeightedNone = 0,
  eWeightedRight = 0x01000000,
  eWeightedNextLeft = 0x02000000,
}

export enum FbxAnimConstantMode {
  eConstantStandard = 0,
  eConstantNext = 0x00000100,
}

export enum FbxAnimLayerBlendMode {
  eBlendAdditive = 0,
  eBlendOverride,
  eBlendOverridePassthrough,
}

export enum FbxAnimRotationAccumulation {
  eRotationByLayer = 0,
  eRotationByChannel,
}

export enum FbxAnimScaleAccumulation {
  eScaleAdditive = 0,
  eScaleMultiply,
}

export interface FbxAnimCurveKey {
  time: FbxTime
  value: number
  interpolation?: FbxAnimInterpolation
  tangentMode?: FbxAnimTangentMode
  weightedMode?: FbxAnimWeightedMode
  constantMode?: FbxAnimConstantMode
  leftDerivative?: number
  rightDerivative?: number
  leftWeight?: number
  rightWeight?: number
  tension?: number
  continuity?: number
  bias?: number
}

export interface FbxAnimCurveBase extends FbxObject {
  classId: 'FbxAnimCurveBase' | 'FbxAnimCurve'
}

export interface FbxAnimCurve extends FbxAnimCurveBase {
  classId: 'FbxAnimCurve'
  keys: FbxAnimCurveKey[]
}

export interface FbxAnimCurveNode extends FbxObject {
  classId: 'FbxAnimCurveNode'
  channels: Array<{ name: string; value: number; curve?: FbxAnimCurve }>
}

export interface FbxAnimLayer extends FbxCollection {
  classId: 'FbxAnimLayer'
  weight?: FbxProperty<number>
  mute?: FbxProperty<boolean>
  solo?: FbxProperty<boolean>
  lock?: FbxProperty<boolean>
  color?: FbxProperty<FbxDouble3>
  blendMode?: FbxProperty<FbxAnimLayerBlendMode>
  rotationAccumulationMode?: FbxProperty<FbxAnimRotationAccumulation>
  scaleAccumulationMode?: FbxProperty<FbxAnimScaleAccumulation>
}

export interface FbxAnimStack extends FbxCollection {
  classId: 'FbxAnimStack'
  layers: FbxAnimLayer[]
  description?: FbxProperty<string>
  localStart?: FbxProperty<FbxTime>
  localStop?: FbxProperty<FbxTime>
  referenceStart?: FbxProperty<FbxTime>
  referenceStop?: FbxProperty<FbxTime>
}
