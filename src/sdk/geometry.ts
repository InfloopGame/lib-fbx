import type {
  EFbxQuatInterpMode,
  FbxAMatrix,
  FbxDouble2,
  FbxDouble3,
  FbxEulerOrder,
  FbxInheritType,
  FbxVector4,
} from './math'
import type { FbxObject, FbxProperty } from './core'
import type { FbxSurfaceMaterial } from './shading'

export enum FbxNodeAttributeType {
  eUnknown = 0,
  eNull,
  eMarker,
  eSkeleton,
  eMesh,
  eNurbs,
  ePatch,
  eCamera,
  eCameraStereo,
  eCameraSwitcher,
  eLight,
  eOpticalReference,
  eOpticalMarker,
  eNurbsCurve,
  eTrimNurbsSurface,
  eBoundary,
  eNurbsSurface,
  eShape,
  eLODGroup,
  eSubDiv,
  eCachedEffect,
  eLine,
}

export enum FbxLayerElementType {
  eUnknown = 0,
  eNormal,
  eBiNormal,
  eTangent,
  eMaterial,
  ePolygonGroup,
  eUV,
  eVertexColor,
  eSmoothing,
  eVertexCrease,
  eEdgeCrease,
  eHole,
  eUserData,
  eVisibility,
  eTextureDiffuse,
  eTextureDiffuseFactor,
  eTextureEmissive,
  eTextureEmissiveFactor,
  eTextureAmbient,
  eTextureAmbientFactor,
  eTextureSpecular,
  eTextureSpecularFactor,
  eTextureShininess,
  eTextureNormalMap,
  eTextureBump,
  eTextureTransparency,
  eTextureTransparencyFactor,
  eTextureReflection,
  eTextureReflectionFactor,
  eTextureDisplacement,
  eTextureDisplacementVector,
  eTypeCount,
}

export enum FbxLayerElementMappingMode {
  eNone = 0,
  eByControlPoint,
  eByPolygonVertex,
  eByPolygon,
  eByEdge,
  eAllSame,
}

export enum FbxLayerElementReferenceMode {
  eDirect = 0,
  eIndex,
  eIndexToDirect,
}

export enum FbxSkeletonType {
  eRoot = 0,
  eLimb,
  eLimbNode,
  eEffector,
}

export enum FbxNullLook {
  eNone = 0,
  eCross,
}

export enum FbxMarkerLook {
  eCube = 0,
  eHardCross,
  eLightCross,
  eSphere,
}

export enum FbxLightType {
  ePoint = 0,
  eDirectional,
  eSpot,
  eArea,
  eVolume,
}

export enum FbxLightDecayType {
  eNone = 0,
  eLinear,
  eQuadratic,
  eCubic,
}

export enum FbxAreaLightShape {
  eRectangle = 0,
  eSphere,
}

export enum FbxCameraProjectionType {
  ePerspective = 0,
  eOrthogonal,
}

export enum FbxNurbsForm {
  ePeriodic = 0,
  eClosed,
  eOpen,
}

export enum FbxDeformerType {
  eUnknown = 0,
  eSkin,
  eBlendShape,
  eVertexCache,
}

export enum FbxSkinningType {
  eRigid = 0,
  eLinear,
  eDualQuaternion,
  eBlend,
}

export enum FbxClusterLinkMode {
  eNormalize = 0,
  eAdditive,
  eTotalOne,
}

export enum FbxSubDeformerType {
  eUnknown = 0,
  eCluster,
  eBlendShapeChannel,
}

export interface FbxLayerElement<T = number> {
  type: FbxLayerElementType
  name?: string
  mappingMode: FbxLayerElementMappingMode
  referenceMode: FbxLayerElementReferenceMode
  directArray: T[] | Float64Array
  indexArray?: Float64Array
}

export interface FbxLayer {
  normals?: FbxLayerElement<FbxVector4>
  binormals?: FbxLayerElement<FbxVector4>
  tangents?: FbxLayerElement<FbxVector4>
  uvs: FbxLayerElement<FbxDouble2>[]
  vertexColors?: FbxLayerElement<FbxVector4>
  materials?: FbxLayerElement<number>
  smoothing?: FbxLayerElement<number>
  visibility?: FbxLayerElement<boolean>
  polygonGroup?: FbxLayerElement<number>
  textures?: Partial<Record<FbxLayerElementType, FbxLayerElement<number>>>
}

export interface FbxNodeAttribute extends FbxObject {
  classId:
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
  attributeType: FbxNodeAttributeType
  color?: FbxProperty<FbxDouble3>
  nodes: FbxNode[]
}

export interface FbxNull extends FbxNodeAttribute {
  classId: 'FbxNull'
  attributeType: FbxNodeAttributeType.eNull
  size?: FbxProperty<number>
  look?: FbxProperty<FbxNullLook>
}

export interface FbxMarker extends FbxNodeAttribute {
  classId: 'FbxMarker'
  attributeType: FbxNodeAttributeType.eMarker | FbxNodeAttributeType.eOpticalMarker
  look?: FbxProperty<FbxMarkerLook>
  drawLink?: FbxProperty<boolean>
  size?: FbxProperty<number>
  showLabel?: FbxProperty<boolean>
  ikPivot?: FbxProperty<FbxDouble3>
}

export interface FbxSkeleton extends FbxNodeAttribute {
  classId: 'FbxSkeleton'
  attributeType: FbxNodeAttributeType.eSkeleton
  skeletonType: FbxSkeletonType
  size?: FbxProperty<number>
  limbLength?: FbxProperty<number>
}

export interface FbxLight extends FbxNodeAttribute {
  classId: 'FbxLight'
  attributeType: FbxNodeAttributeType.eLight
  lightType?: FbxProperty<FbxLightType>
  castLight?: FbxProperty<boolean>
  drawVolumetricLight?: FbxProperty<boolean>
  drawGroundProjection?: FbxProperty<boolean>
  drawFrontFacingVolumetricLight?: FbxProperty<boolean>
  intensity?: FbxProperty<number>
  innerAngle?: FbxProperty<number>
  outerAngle?: FbxProperty<number>
  fog?: FbxProperty<number>
  decayType?: FbxProperty<FbxLightDecayType>
  decayStart?: FbxProperty<number>
  fileName?: FbxProperty<string>
  enableNearAttenuation?: FbxProperty<boolean>
  nearAttenuationStart?: FbxProperty<number>
  nearAttenuationEnd?: FbxProperty<number>
  enableFarAttenuation?: FbxProperty<boolean>
  farAttenuationStart?: FbxProperty<number>
  farAttenuationEnd?: FbxProperty<number>
  castShadows?: FbxProperty<boolean>
  shadowColor?: FbxProperty<FbxDouble3>
  areaLightShape?: FbxProperty<FbxAreaLightShape>
  leftBarnDoor?: FbxProperty<number>
  rightBarnDoor?: FbxProperty<number>
  topBarnDoor?: FbxProperty<number>
  bottomBarnDoor?: FbxProperty<number>
  enableBarnDoor?: FbxProperty<boolean>
}

export interface FbxCamera extends FbxNodeAttribute {
  classId: 'FbxCamera' | 'FbxCameraStereo'
  attributeType: FbxNodeAttributeType.eCamera | FbxNodeAttributeType.eCameraStereo
  position?: FbxProperty<FbxDouble3>
  upVector?: FbxProperty<FbxDouble3>
  interestPosition?: FbxProperty<FbxDouble3>
  roll?: FbxProperty<number>
  aspectWidth?: FbxProperty<number>
  aspectHeight?: FbxProperty<number>
  pixelAspectRatio?: FbxProperty<number>
  fieldOfView?: FbxProperty<number>
  fieldOfViewX?: FbxProperty<number>
  fieldOfViewY?: FbxProperty<number>
  focalLength?: FbxProperty<number>
  nearPlane?: FbxProperty<number>
  farPlane?: FbxProperty<number>
  autoComputeClipPlanes?: FbxProperty<boolean>
  filmWidth?: FbxProperty<number>
  filmHeight?: FbxProperty<number>
  filmAspectRatio?: FbxProperty<number>
  projectionType?: FbxProperty<FbxCameraProjectionType>
  orthoZoom?: FbxProperty<number>
  apertureMode?: FbxProperty<number>
  gateFit?: FbxProperty<number>
  cameraFormat?: FbxProperty<number>
  aspectRatioMode?: FbxProperty<number>
}

export interface FbxCameraStereo extends FbxCamera {
  classId: 'FbxCameraStereo'
  attributeType: FbxNodeAttributeType.eCameraStereo
}

export interface FbxCameraSwitcher extends FbxNodeAttribute {
  classId: 'FbxCameraSwitcher'
  attributeType: FbxNodeAttributeType.eCameraSwitcher
}

export interface FbxOpticalReference extends FbxNodeAttribute {
  classId: 'FbxOpticalReference'
  attributeType: FbxNodeAttributeType.eOpticalReference
}

export interface FbxLODGroup extends FbxNodeAttribute {
  classId: 'FbxLODGroup'
  attributeType: FbxNodeAttributeType.eLODGroup
  thresholdsUsedAsPercentage?: FbxProperty<boolean>
  minMaxDistance?: FbxProperty<boolean>
  minDistance?: FbxProperty<number>
  maxDistance?: FbxProperty<number>
  worldSpace?: FbxProperty<boolean>
}

export interface FbxCachedEffect extends FbxNodeAttribute {
  classId: 'FbxCachedEffect'
  attributeType: FbxNodeAttributeType.eCachedEffect
  cache?: FbxCache
}

export interface FbxLayerContainer extends FbxNodeAttribute {
  classId:
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
  layers: FbxLayer[]
}

export interface FbxGeometryBase extends FbxLayerContainer {
  classId:
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
  controlPoints: Float64Array
  primaryVisibility?: FbxProperty<boolean>
  castShadow?: FbxProperty<boolean>
  receiveShadow?: FbxProperty<boolean>
  bBoxMin?: FbxProperty<FbxDouble3>
  bBoxMax?: FbxProperty<FbxDouble3>
}

export interface FbxGeometry extends FbxGeometryBase {
  classId:
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
    | 'FbxProceduralGeometry'
  deformers: FbxDeformer[]
}

export interface FbxMesh extends FbxGeometry {
  classId: 'FbxMesh'
  attributeType: FbxNodeAttributeType.eMesh
  polygonIndexes: Float64Array
}

export interface FbxNurbs extends FbxGeometry {
  classId: 'FbxNurbs'
  attributeType: FbxNodeAttributeType.eNurbs
  uOrder: number
  vOrder: number
  uCount: number
  vCount: number
  uType: FbxNurbsForm
  vType: FbxNurbsForm
  uKnotVector: Float64Array
  vKnotVector: Float64Array
}

export interface FbxNurbsCurve extends FbxGeometry {
  classId: 'FbxNurbsCurve'
  attributeType: FbxNodeAttributeType.eNurbsCurve
  order: number
  form: FbxNurbsForm
  knotVector: Float64Array
  step?: number
  dimension?: 2 | 3
}

export interface FbxNurbsSurface extends FbxGeometry {
  classId: 'FbxNurbsSurface'
  attributeType: FbxNodeAttributeType.eNurbsSurface
  uOrder: number
  vOrder: number
  uCount: number
  vCount: number
  uType: FbxNurbsForm
  vType: FbxNurbsForm
  uKnotVector: Float64Array
  vKnotVector: Float64Array
}

export interface FbxBoundary extends FbxGeometry {
  classId: 'FbxBoundary'
  attributeType: FbxNodeAttributeType.eBoundary
  curves: FbxNurbsCurve[]
}

export interface FbxTrimNurbsSurface extends FbxGeometry {
  classId: 'FbxTrimNurbsSurface'
  attributeType: FbxNodeAttributeType.eTrimNurbsSurface
  nurbs: FbxNurbsSurface
  boundaries: FbxBoundary[]
}

export interface FbxPatch extends FbxGeometry {
  classId: 'FbxPatch'
  attributeType: FbxNodeAttributeType.ePatch
  uCount: number
  vCount: number
  uStep?: number
  vStep?: number
}

export interface FbxLine extends FbxGeometry {
  classId: 'FbxLine'
  attributeType: FbxNodeAttributeType.eLine
  indexEnd?: Float64Array
  renderable?: FbxProperty<boolean>
}

export interface FbxSubDiv extends FbxGeometry {
  classId: 'FbxSubDiv'
  attributeType: FbxNodeAttributeType.eSubDiv
  level?: number
}

export interface FbxProceduralGeometry extends FbxGeometry {
  classId: 'FbxProceduralGeometry'
}

export interface FbxShape extends FbxGeometryBase {
  classId: 'FbxShape'
  attributeType: FbxNodeAttributeType.eShape
  legacyStyle?: FbxProperty<boolean>
  absoluteMode?: FbxProperty<boolean>
}

export interface FbxDeformer extends FbxObject {
  classId: 'FbxDeformer' | 'FbxSkin' | 'FbxBlendShape' | 'FbxVertexCacheDeformer'
  deformerType: FbxDeformerType
  multiLayer?: boolean
}

export interface FbxSkin extends FbxDeformer {
  classId: 'FbxSkin'
  deformerType: FbxDeformerType.eSkin
  skinningType: FbxSkinningType
  clusters: FbxCluster[]
  controlPointIndices?: Float64Array
  controlPointWeights?: Float64Array
}

export interface FbxBlendShape extends FbxDeformer {
  classId: 'FbxBlendShape'
  deformerType: FbxDeformerType.eBlendShape
  channels: FbxBlendShapeChannel[]
}

export interface FbxVertexCacheDeformer extends FbxDeformer {
  classId: 'FbxVertexCacheDeformer'
  deformerType: FbxDeformerType.eVertexCache
  cache?: FbxCache
}

export interface FbxSubDeformer extends FbxObject {
  classId: 'FbxSubDeformer' | 'FbxCluster' | 'FbxBlendShapeChannel'
  subDeformerType: FbxSubDeformerType
  multiLayer?: boolean
}

export interface FbxCluster extends FbxSubDeformer {
  classId: 'FbxCluster'
  subDeformerType: FbxSubDeformerType.eCluster
  linkMode: FbxClusterLinkMode
  link?: FbxNode
  associateModel?: FbxNode
  indexes: Float64Array
  weights: Float64Array
  transform?: FbxAMatrix
  transformLink?: FbxAMatrix
  transformAssociateModel?: FbxAMatrix
}

export interface FbxBlendShapeChannel extends FbxSubDeformer {
  classId: 'FbxBlendShapeChannel'
  subDeformerType: FbxSubDeformerType.eBlendShapeChannel
  deformPercent?: number
  targetShapes: Array<{ shape: FbxShape; fullWeight: number }>
}

export interface FbxCache extends FbxObject {
  classId: 'FbxCache'
  fileName?: string
}

export interface FbxGenericNode extends FbxObject {
  classId: 'FbxGenericNode'
}

export interface FbxNode extends FbxObject {
  classId: 'FbxNode'
  parent: FbxNode | null
  children: FbxNode[]
  nodeAttributes: FbxNodeAttribute[]
  materials: FbxSurfaceMaterial[]
  lclTranslation?: FbxProperty<FbxDouble3>
  lclRotation?: FbxProperty<FbxDouble3>
  lclScaling?: FbxProperty<FbxDouble3>
  visibility?: FbxProperty<number>
  visibilityInheritance?: FbxProperty<boolean>
  quaternionInterpolate?: FbxProperty<EFbxQuatInterpMode>
  rotationOffset?: FbxProperty<FbxDouble3>
  rotationPivot?: FbxProperty<FbxDouble3>
  scalingOffset?: FbxProperty<FbxDouble3>
  scalingPivot?: FbxProperty<FbxDouble3>
  translationActive?: FbxProperty<boolean>
  translationMin?: FbxProperty<FbxDouble3>
  translationMax?: FbxProperty<FbxDouble3>
  translationMinX?: FbxProperty<boolean>
  translationMinY?: FbxProperty<boolean>
  translationMinZ?: FbxProperty<boolean>
  translationMaxX?: FbxProperty<boolean>
  translationMaxY?: FbxProperty<boolean>
  translationMaxZ?: FbxProperty<boolean>
  rotationOrder?: FbxProperty<FbxEulerOrder>
  rotationSpaceForLimitOnly?: FbxProperty<boolean>
  rotationStiffnessX?: FbxProperty<number>
  rotationStiffnessY?: FbxProperty<number>
  rotationStiffnessZ?: FbxProperty<number>
  axisLen?: FbxProperty<number>
  preRotation?: FbxProperty<FbxDouble3>
  postRotation?: FbxProperty<FbxDouble3>
  rotationActive?: FbxProperty<boolean>
  rotationMin?: FbxProperty<FbxDouble3>
  rotationMax?: FbxProperty<FbxDouble3>
  rotationMinX?: FbxProperty<boolean>
  rotationMinY?: FbxProperty<boolean>
  rotationMinZ?: FbxProperty<boolean>
  rotationMaxX?: FbxProperty<boolean>
  rotationMaxY?: FbxProperty<boolean>
  rotationMaxZ?: FbxProperty<boolean>
  inheritType?: FbxProperty<FbxInheritType>
  scalingActive?: FbxProperty<boolean>
  scalingMin?: FbxProperty<FbxDouble3>
  scalingMax?: FbxProperty<FbxDouble3>
  scalingMinX?: FbxProperty<boolean>
  scalingMinY?: FbxProperty<boolean>
  scalingMinZ?: FbxProperty<boolean>
  scalingMaxX?: FbxProperty<boolean>
  scalingMaxY?: FbxProperty<boolean>
  scalingMaxZ?: FbxProperty<boolean>
  geometricTranslation?: FbxProperty<FbxDouble3>
  geometricRotation?: FbxProperty<FbxDouble3>
  geometricScaling?: FbxProperty<FbxDouble3>
  minDampRangeX?: FbxProperty<number>
  minDampRangeY?: FbxProperty<number>
  minDampRangeZ?: FbxProperty<number>
  maxDampRangeX?: FbxProperty<number>
  maxDampRangeY?: FbxProperty<number>
  maxDampRangeZ?: FbxProperty<number>
  minDampStrengthX?: FbxProperty<number>
  minDampStrengthY?: FbxProperty<number>
  minDampStrengthZ?: FbxProperty<number>
  maxDampStrengthX?: FbxProperty<number>
  maxDampStrengthY?: FbxProperty<number>
  maxDampStrengthZ?: FbxProperty<number>
  preferedAngleX?: FbxProperty<number>
  preferedAngleY?: FbxProperty<number>
  preferedAngleZ?: FbxProperty<number>
  lookAtProperty?: FbxProperty<FbxObject>
  upVectorProperty?: FbxProperty<FbxObject>
  show?: FbxProperty<boolean>
  negativePercentShapeSupport?: FbxProperty<boolean>
  defaultAttributeIndex?: FbxProperty<number>
  freeze?: FbxProperty<boolean>
  lodBox?: FbxProperty<boolean>
  target?: FbxNode
  targetUp?: FbxNode
}
