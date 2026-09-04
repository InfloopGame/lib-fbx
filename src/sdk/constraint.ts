import type { FbxDouble3, FbxVector4 } from './math'
import type { FbxObject, FbxProperty } from './core'
import type { FbxNode } from './geometry'

export enum FbxConstraintType {
  eUnknown = 0,
  ePosition,
  eRotation,
  eScale,
  eParent,
  eSingleChainIK,
  eAim,
  eCharacter,
  eCustom,
}

export enum FbxCharacterLinkType {
  eCharacterLink = 0,
  eControlSetLink,
  eControlSetEffector,
  eControlSetEffectorAux,
}

export enum FbxControlSetType {
  eNone = 0,
  eFkIk,
  eIkOnly,
}

export interface FbxConstraint extends FbxObject {
  classId:
    | 'FbxConstraint'
    | 'FbxConstraintAim'
    | 'FbxConstraintCustom'
    | 'FbxConstraintParent'
    | 'FbxConstraintPosition'
    | 'FbxConstraintRotation'
    | 'FbxConstraintScale'
    | 'FbxConstraintSingleChainIK'
    | 'FbxCharacter'
  constraintType: FbxConstraintType
  weight?: FbxProperty<number>
  active?: FbxProperty<boolean>
  lock?: FbxProperty<boolean>
  constrainedObject?: FbxObject
  constraintSources: FbxObject[]
}

export interface FbxConstraintPosition extends FbxConstraint {
  classId: 'FbxConstraintPosition'
  constraintType: FbxConstraintType.ePosition
  affectX?: FbxProperty<boolean>
  affectY?: FbxProperty<boolean>
  affectZ?: FbxProperty<boolean>
  translation?: FbxProperty<FbxDouble3>
}

export interface FbxConstraintRotation extends FbxConstraint {
  classId: 'FbxConstraintRotation'
  constraintType: FbxConstraintType.eRotation
  affectX?: FbxProperty<boolean>
  affectY?: FbxProperty<boolean>
  affectZ?: FbxProperty<boolean>
  rotation?: FbxProperty<FbxDouble3>
}

export interface FbxConstraintScale extends FbxConstraint {
  classId: 'FbxConstraintScale'
  constraintType: FbxConstraintType.eScale
  affectX?: FbxProperty<boolean>
  affectY?: FbxProperty<boolean>
  affectZ?: FbxProperty<boolean>
  scaling?: FbxProperty<FbxDouble3>
}

export interface FbxConstraintParent extends FbxConstraint {
  classId: 'FbxConstraintParent'
  constraintType: FbxConstraintType.eParent
  affectTranslationX?: FbxProperty<boolean>
  affectTranslationY?: FbxProperty<boolean>
  affectTranslationZ?: FbxProperty<boolean>
  affectRotationX?: FbxProperty<boolean>
  affectRotationY?: FbxProperty<boolean>
  affectRotationZ?: FbxProperty<boolean>
  affectScalingX?: FbxProperty<boolean>
  affectScalingY?: FbxProperty<boolean>
  affectScalingZ?: FbxProperty<boolean>
}

export interface FbxConstraintAim extends FbxConstraint {
  classId: 'FbxConstraintAim'
  constraintType: FbxConstraintType.eAim
  rotationOffset?: FbxProperty<FbxDouble3>
  aimAtObjects: FbxObject[]
  worldUpType?: FbxProperty<number>
  worldUpObject?: FbxObject
  worldUpVector?: FbxProperty<FbxDouble3>
  upVector?: FbxProperty<FbxDouble3>
  aimVector?: FbxProperty<FbxDouble3>
  affectX?: FbxProperty<boolean>
  affectY?: FbxProperty<boolean>
  affectZ?: FbxProperty<boolean>
}

export interface FbxConstraintSingleChainIK extends FbxConstraint {
  classId: 'FbxConstraintSingleChainIK'
  constraintType: FbxConstraintType.eSingleChainIK
  poleVectorType?: FbxProperty<number>
  solverType?: FbxProperty<number>
  evaluateTSAnim?: FbxProperty<number>
  poleVectorObjects: FbxObject[]
  poleVector?: FbxProperty<FbxDouble3>
  twist?: FbxProperty<number>
  firstJointObject?: FbxObject
  endJointObject?: FbxObject
  effectorObject?: FbxObject
}

export interface FbxConstraintCustom extends FbxConstraint {
  classId: 'FbxConstraintCustom'
  constraintType: FbxConstraintType.eCustom
}

export interface FbxCharacterLink {
  type: FbxCharacterLinkType
  node?: FbxNode
  templateName?: string
  offsetT?: FbxVector4
  offsetR?: FbxVector4
  offsetS?: FbxVector4
}

export interface FbxCharacter extends FbxConstraint {
  classId: 'FbxCharacter'
  constraintType: FbxConstraintType.eCharacter
  links: FbxCharacterLink[]
  pullIterationCount?: FbxProperty<number>
  scaleCompensation?: FbxProperty<number>
  forceActorSpace?: FbxProperty<boolean>
  applyLimits?: FbxProperty<boolean>
  mirrorMode?: FbxProperty<boolean>
}

export interface FbxCharacterPose extends FbxObject {
  classId: 'FbxCharacterPose'
  character?: FbxCharacter
}

export interface FbxControlSetPlug extends FbxObject {
  classId: 'FbxControlSetPlug'
  controlSetType?: FbxProperty<FbxControlSetType>
  useAxis?: FbxProperty<boolean>
  character?: FbxCharacter
}
