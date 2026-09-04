import type { FbxDouble2, FbxDouble3, FbxDouble4, FbxDouble4x4 } from './math'

/** FBX KTime：每秒 tick 数（与 SDK `FBXSDK_TC_SECOND` 一致）。 */
export const FBXSDK_TC_SECOND = 46186158000

export enum EFbxTimeMode {
  eDefaultMode = 0,
  eFrames120,
  eFrames100,
  eFrames60,
  eFrames50,
  eFrames48,
  eFrames30,
  eFrames30Drop,
  eNTSCDropFrame,
  eNTSCFullFrame,
  ePAL,
  eFrames24,
  eFrames1000,
  eFilmFullFrame,
  eCustom,
  eFrames96,
  eFrames72,
  eFrames59dot94,
  eFrames119dot88,
  eModesCount,
}

export enum EFbxTimeProtocol {
  eSMPTE = 0,
  eFrameCount,
  eDefaultProtocol,
}

export interface FbxTime {
  ticks: number
}

export interface FbxTimeSpan {
  start: FbxTime
  stop: FbxTime
}

/**
 * 与 fbxpropertytypes.h `EFbxType` 对齐。
 * eFbxEnumM 在 C++ 为 -17，其余为正序号。
 */
export enum EFbxType {
  eFbxUndefined = 0,
  eFbxChar = 1,
  eFbxUChar = 2,
  eFbxShort = 3,
  eFbxUShort = 4,
  eFbxUInt = 5,
  eFbxLongLong = 6,
  eFbxULongLong = 7,
  eFbxHalfFloat = 8,
  eFbxBool = 9,
  eFbxInt = 10,
  eFbxFloat = 11,
  eFbxDouble = 12,
  eFbxDouble2 = 13,
  eFbxDouble3 = 14,
  eFbxDouble4 = 15,
  eFbxDouble4x4 = 16,
  eFbxEnum = 17,
  eFbxEnumM = -17,
  eFbxString = 18,
  eFbxTime = 19,
  eFbxReference = 20,
  eFbxBlob = 21,
  eFbxDistance = 22,
  eFbxDateTime = 23,
  eFbxTypeCount = 24,
}

export enum FbxPropertyFlags {
  eNone = 0,
  eStatic = 1 << 0,
  eAnimatable = 1 << 1,
  eAnimated = 1 << 2,
  eImported = 1 << 3,
  eUserDefined = 1 << 4,
  eHidden = 1 << 5,
  eNotSavable = 1 << 6,
  eLockedMember0 = 1 << 7,
  eLockedMember1 = 1 << 8,
  eLockedMember2 = 1 << 9,
  eLockedMember3 = 1 << 10,
  eMutedMember0 = 1 << 11,
  eMutedMember1 = 1 << 12,
  eMutedMember2 = 1 << 13,
  eMutedMember3 = 1 << 14,
}

export enum FbxObjectFlag {
  eNone = 0,
  eInitialized = 1 << 0,
  eSystem = 1 << 1,
  eSavable = 1 << 2,
  eSelected = 1 << 3,
  eHidden = 1 << 4,
  eContentLoaded = 1 << 5,
  eDontLocalize = 1 << 6,
}

/** 对象/属性连接类型（对齐 FbxConnection::EType 位标志）。 */
export enum FbxConnectionType {
  eNone = 0,
  eSystem = 1 << 0,
  eUser = 1 << 1,
  eReference = 1 << 2,
  eContains = 1 << 3,
  eData = 1 << 4,
  eUnidirectional = 1 << 7,
}

export type FbxConnectionFileKind = 'OO' | 'OP' | 'PO' | 'PP'

export type FbxClassId =
  | 'FbxObject'
  | 'FbxCollection'
  | 'FbxCollectionExclusive'
  | 'FbxContainer'
  | 'FbxDocument'
  | 'FbxScene'
  | 'FbxDocumentInfo'
  | 'FbxLibrary'
  | 'FbxDisplayLayer'
  | 'FbxSelectionSet'
  | 'FbxSelectionNode'
  | 'FbxThumbnail'
  | 'FbxMediaClip'
  | 'FbxVideo'
  | 'FbxAudio'
  | 'FbxAudioLayer'
  | 'FbxPose'
  | 'FbxSceneReference'
  | 'FbxObjectMetaData'
  | 'FbxEnvironment'
  | 'FbxGlobalSettings'
  | 'FbxNode'
  | 'FbxNodeAttribute'
  | 'FbxNull'
  | 'FbxMarker'
  | 'FbxSkeleton'
  | 'FbxCamera'
  | 'FbxCameraStereo'
  | 'FbxCameraSwitcher'
  | 'FbxLight'
  | 'FbxOpticalReference'
  | 'FbxLODGroup'
  | 'FbxCachedEffect'
  | 'FbxLayerContainer'
  | 'FbxGeometryBase'
  | 'FbxGeometry'
  | 'FbxMesh'
  | 'FbxNurbs'
  | 'FbxNurbsCurve'
  | 'FbxNurbsSurface'
  | 'FbxTrimNurbsSurface'
  | 'FbxBoundary'
  | 'FbxPatch'
  | 'FbxLine'
  | 'FbxSubDiv'
  | 'FbxShape'
  | 'FbxProceduralGeometry'
  | 'FbxDeformer'
  | 'FbxSkin'
  | 'FbxBlendShape'
  | 'FbxVertexCacheDeformer'
  | 'FbxSubDeformer'
  | 'FbxCluster'
  | 'FbxBlendShapeChannel'
  | 'FbxCache'
  | 'FbxGenericNode'
  | 'FbxSurfaceMaterial'
  | 'FbxSurfaceLambert'
  | 'FbxSurfacePhong'
  | 'FbxTexture'
  | 'FbxFileTexture'
  | 'FbxLayeredTexture'
  | 'FbxProceduralTexture'
  | 'FbxImplementation'
  | 'FbxBindingTable'
  | 'FbxBindingOperator'
  | 'FbxAnimStack'
  | 'FbxAnimLayer'
  | 'FbxAnimCurveNode'
  | 'FbxAnimCurve'
  | 'FbxAnimCurveBase'
  | 'FbxConstraint'
  | 'FbxConstraintAim'
  | 'FbxConstraintCustom'
  | 'FbxConstraintParent'
  | 'FbxConstraintPosition'
  | 'FbxConstraintRotation'
  | 'FbxConstraintScale'
  | 'FbxConstraintSingleChainIK'
  | 'FbxCharacter'
  | 'FbxCharacterPose'
  | 'FbxControlSetPlug'

export type FbxPropertyData =
  | boolean
  | number
  | string
  | FbxDouble2
  | FbxDouble3
  | FbxDouble4
  | FbxDouble4x4
  | FbxTime
  | ArrayBuffer
  | FbxObject
  | null
  | undefined

export interface FbxProperty<T = FbxPropertyData> {
  name: string
  dataType: EFbxType
  flags: number
  value: T
  children?: FbxProperty[]
  srcObjects?: FbxObject[]
  dstObjects?: FbxObject[]
}

export interface FbxObject {
  uniqueId: number
  name: string
  classId: FbxClassId
  objectFlags: number
  properties: FbxProperty[]
  srcObjects: FbxObject[]
  dstObjects: FbxObject[]
}

export interface FbxCollection extends FbxObject {
  members: FbxObject[]
}

export interface FbxConnection {
  src: FbxObject | FbxProperty
  dst: FbxObject | FbxProperty
  type: number
  fileKind?: FbxConnectionFileKind
}

export interface FbxSystemUnit {
  scaleFactor: number
  multiplier: number
}
