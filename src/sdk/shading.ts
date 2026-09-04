import type { FbxDouble3 } from './math'
import type { FbxObject, FbxProperty } from './core'

export enum FbxTextureWrapMode {
  eRepeat = 0,
  eClamp,
}

export enum FbxTextureBlendMode {
  eTranslucent = 0,
  eAdditive,
  eModulate,
  eModulate2,
  eOver,
}

export interface FbxSurfaceMaterial extends FbxObject {
  classId: 'FbxSurfaceMaterial' | 'FbxSurfaceLambert' | 'FbxSurfacePhong'
  shadingModel?: FbxProperty<string>
  multiLayer?: FbxProperty<boolean>
}

export interface FbxSurfaceLambert extends FbxSurfaceMaterial {
  classId: 'FbxSurfaceLambert' | 'FbxSurfacePhong'
  emissive?: FbxProperty<FbxDouble3>
  emissiveFactor?: FbxProperty<number>
  ambient?: FbxProperty<FbxDouble3>
  ambientFactor?: FbxProperty<number>
  diffuse?: FbxProperty<FbxDouble3>
  diffuseFactor?: FbxProperty<number>
  normalMap?: FbxProperty<FbxDouble3>
  bump?: FbxProperty<FbxDouble3>
  bumpFactor?: FbxProperty<number>
  transparentColor?: FbxProperty<FbxDouble3>
  transparencyFactor?: FbxProperty<number>
  displacementColor?: FbxProperty<FbxDouble3>
  displacementFactor?: FbxProperty<number>
  vectorDisplacementColor?: FbxProperty<FbxDouble3>
  vectorDisplacementFactor?: FbxProperty<number>
}

export interface FbxSurfacePhong extends FbxSurfaceLambert {
  classId: 'FbxSurfacePhong'
  specular?: FbxProperty<FbxDouble3>
  specularFactor?: FbxProperty<number>
  shininess?: FbxProperty<number>
  reflection?: FbxProperty<FbxDouble3>
  reflectionFactor?: FbxProperty<number>
}

export interface FbxTexture extends FbxObject {
  classId: 'FbxTexture' | 'FbxFileTexture' | 'FbxLayeredTexture' | 'FbxProceduralTexture'
  textureTypeUse?: FbxProperty<number>
  alpha?: FbxProperty<number>
  currentMappingType?: FbxProperty<number>
  wrapModeU?: FbxProperty<FbxTextureWrapMode>
  wrapModeV?: FbxProperty<FbxTextureWrapMode>
  uvSwap?: FbxProperty<boolean>
  premultiplyAlpha?: FbxProperty<boolean>
  translation?: FbxProperty<FbxDouble3>
  rotation?: FbxProperty<FbxDouble3>
  scaling?: FbxProperty<FbxDouble3>
  rotationPivot?: FbxProperty<FbxDouble3>
  scalingPivot?: FbxProperty<FbxDouble3>
  currentTextureBlendMode?: FbxProperty<FbxTextureBlendMode>
  uvSet?: FbxProperty<string>
}

export interface FbxFileTexture extends FbxTexture {
  classId: 'FbxFileTexture'
  useMaterial?: FbxProperty<boolean>
  useMipMap?: FbxProperty<boolean>
  fileName?: string
  relativeFileName?: string
  media?: FbxObject
}

export interface FbxLayeredTexture extends FbxTexture {
  classId: 'FbxLayeredTexture'
  layers: Array<{ texture: FbxTexture; blendMode: FbxTextureBlendMode; alpha: number }>
}

export interface FbxProceduralTexture extends FbxTexture {
  classId: 'FbxProceduralTexture'
  blobProp?: FbxProperty<ArrayBuffer>
}

export interface FbxBindingTableEntry {
  source: string
  destination: string
}

export interface FbxBindingTable extends FbxObject {
  classId: 'FbxBindingTable'
  targetName?: FbxProperty<string>
  targetType?: FbxProperty<string>
  descRelativeURL?: FbxProperty<string>
  descAbsoluteURL?: FbxProperty<string>
  descTAG?: FbxProperty<string>
  codeRelativeURL?: FbxProperty<string>
  codeAbsoluteURL?: FbxProperty<string>
  codeTAG?: FbxProperty<string>
  entries: FbxBindingTableEntry[]
}

export interface FbxBindingOperator extends FbxObject {
  classId: 'FbxBindingOperator'
  functionName?: FbxProperty<string>
  targetName?: FbxProperty<string>
}

export interface FbxImplementation extends FbxObject {
  classId: 'FbxImplementation'
  language?: FbxProperty<string>
  languageVersion?: FbxProperty<string>
  renderAPI?: FbxProperty<string>
  renderAPIVersion?: FbxProperty<string>
  rootBindingName?: FbxProperty<string>
}
