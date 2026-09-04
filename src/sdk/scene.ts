import type { FbxColor, FbxMatrix } from './math'
import type {
  EFbxTimeMode,
  FbxCollection,
  FbxConnection,
  FbxObject,
  FbxSystemUnit,
  FbxTime,
} from './core'
import type { FbxAnimStack } from './animation'
import type { FbxCamera, FbxLight, FbxNode } from './geometry'
import type { FbxSurfaceMaterial, FbxTexture } from './shading'

export enum FbxAxisUpVector {
  eXAxis = 1,
  eYAxis = 2,
  eZAxis = 3,
}

export enum FbxAxisFrontVector {
  eParityEven = 1,
  eParityOdd = 2,
}

export enum FbxCoordSystem {
  eRightHanded = 0,
  eLeftHanded,
}

export interface FbxAxisSystem {
  upVector: FbxAxisUpVector
  upSign: 1 | -1
  frontVector: FbxAxisFrontVector
  frontSign: 1 | -1
  coordSystem: FbxCoordSystem
}

export interface FbxDocumentInfo extends FbxObject {
  classId: 'FbxDocumentInfo'
  title?: string
  subject?: string
  author?: string
  keywords?: string
  revision?: string
  comment?: string
}

export interface FbxThumbnail extends FbxObject {
  classId: 'FbxThumbnail'
  width?: number
  height?: number
  image?: ArrayBuffer
}

export interface FbxTakeInfo {
  name: string
  description?: string
  localTimeSpan?: { start: FbxTime; stop: FbxTime }
  referenceTimeSpan?: { start: FbxTime; stop: FbxTime }
}

export interface FbxPoseInfo {
  node: FbxNode
  matrix: FbxMatrix
  matrixIsLocal: boolean
}

export interface FbxPose extends FbxObject {
  classId: 'FbxPose'
  bindPose: boolean
  restPose?: boolean
  poseInfos: FbxPoseInfo[]
}

export interface FbxMediaClip extends FbxObject {
  classId: 'FbxMediaClip' | 'FbxVideo' | 'FbxAudio'
  fileName?: string
  relativeFileName?: string
  color?: FbxColor
  playSpeed?: number
  offset?: FbxTime
}

export interface FbxVideo extends FbxMediaClip {
  classId: 'FbxVideo'
  width?: number
  height?: number
  startFrame?: number
  stopFrame?: number
  content?: ArrayBuffer
}

export interface FbxAudio extends FbxMediaClip {
  classId: 'FbxAudio'
}

export interface FbxAudioLayer extends FbxCollection {
  classId: 'FbxAudioLayer'
}

export interface FbxGlobalSettings extends FbxObject {
  classId: 'FbxGlobalSettings'
  axisSystem: FbxAxisSystem
  originalUpAxis?: number
  systemUnit: FbxSystemUnit
  originalSystemUnit?: FbxSystemUnit
  ambientColor?: FbxColor
  defaultCamera?: string
  timeMode?: EFbxTimeMode
  timeProtocol?: number
  customFrameRate?: number
}

export interface FbxDocument extends FbxCollection {
  classId: 'FbxDocument' | 'FbxScene' | 'FbxLibrary'
  documentInfo?: FbxDocumentInfo
  roots: FbxObject[]
}

export interface FbxLibrary extends FbxDocument {
  classId: 'FbxLibrary'
}

export interface FbxContainer extends FbxObject {
  classId: 'FbxContainer'
}

export interface FbxCollectionExclusive extends FbxCollection {
  classId: 'FbxCollectionExclusive' | 'FbxDisplayLayer'
}

export interface FbxDisplayLayer extends FbxCollectionExclusive {
  classId: 'FbxDisplayLayer'
}

export interface FbxSelectionSet extends FbxCollection {
  classId: 'FbxSelectionSet'
}

export interface FbxSelectionNode extends FbxObject {
  classId: 'FbxSelectionNode'
}

export interface FbxSceneReference extends FbxObject {
  classId: 'FbxSceneReference'
}

export interface FbxObjectMetaData extends FbxObject {
  classId: 'FbxObjectMetaData'
}

export interface FbxEnvironment extends FbxObject {
  classId: 'FbxEnvironment'
}

export interface FbxScene extends FbxDocument {
  classId: 'FbxScene'
  rootNode: FbxNode
  globalSettings: FbxGlobalSettings
  poses: FbxPose[]
  animStacks: FbxAnimStack[]
  materials: FbxSurfaceMaterial[]
  textures: FbxTexture[]
  videos: FbxVideo[]
  cameras: FbxCamera[]
  lights: FbxLight[]
  connections: FbxConnection[]
}
