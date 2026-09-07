export type FbxFormat = 'binary' | 'ascii'

export type FbxInput = ArrayBuffer | Uint8Array | string

export type FbxErrorCode =
  | 'EMPTY_INPUT'
  | 'UNKNOWN_FORMAT'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_DATA'

/**
 * 单个 FBX 属性值。
 *
 * 数字数组约定：所有 int32 / int64 / float32 / float64 数组统一为 `Float64Array`。
 * int64 遵循 JavaScript number 的 2^53 精度限制。
 * `number[]` 只出现在 3-元素 tuple 语义（如 `Lcl_Translation.value`）。
 */
export type FbxProperty =
  | boolean
  | number
  | bigint
  | string
  | boolean[]
  | number[]
  | Float64Array
  | ArrayBuffer

export interface FbxTreeNode {
  name: string
  propertyList: FbxProperty[]
  [key: string]: unknown
}

export interface FbxTreeData {
  [section: string]: unknown
  Objects?: FbxObjects
  Connections?: FbxConnections
  GlobalSettings?: FbxGlobalSettings
}

export interface FbxObjects {
  Geometry?: Record<number, FbxGeometryNode>
  Model?: Record<number, FbxModelNode>
  Material?: Record<number, FbxMaterialNode>
  Texture?: Record<number, FbxTextureNode>
  Video?: Record<number, FbxVideoNode>
  Deformer?: Record<number, FbxDeformerNode>
  NodeAttribute?: Record<number, FbxNodeAttributeNode>
  AnimationStack?: Record<number, FbxAnimStackNode>
  AnimationLayer?: Record<number, FbxAnimLayerNode>
  AnimationCurveNode?: Record<number, FbxAnimCurveNodeNode>
  AnimationCurve?: Record<number, FbxAnimCurveNode>
  Pose?: Record<number, FbxPoseNode>
  [key: string]: unknown
}

export interface FbxLayerElement {
  MappingInformationType: string
  ReferenceInformationType: string
  [key: string]: unknown
}

export interface FbxGeometryNode {
  id: number
  attrName?: string
  attrType?: string
  Vertices?: { a: Float64Array }
  PolygonVertexIndex?: { a: Float64Array }
  LayerElementNormal?: FbxLayerElement[]
  LayerElementTangent?: FbxLayerElement[]
  LayerElementUV?: FbxLayerElement[]
  LayerElementColor?: FbxLayerElement[]
  LayerElementMaterial?: FbxLayerElement[]
  Edges?: { a: Float64Array }
  Order?: number
  KnotVector?: { a: Float64Array }
  Points?: { a: Float64Array }
  Form?: string
  [key: string]: unknown
}

export interface FbxPropertyValue {
  type: string
  type2?: string
  flag?: string
  value: unknown
}

export interface FbxModelNode {
  id: number
  attrName?: string
  attrType?: string
  Lcl_Translation?: FbxPropertyValue
  Lcl_Rotation?: FbxPropertyValue
  Lcl_Scaling?: FbxPropertyValue
  PreRotation?: FbxPropertyValue
  PostRotation?: FbxPropertyValue
  RotationOrder?: FbxPropertyValue
  InheritType?: FbxPropertyValue
  GeometricTranslation?: FbxPropertyValue
  GeometricRotation?: FbxPropertyValue
  GeometricScaling?: FbxPropertyValue
  ScalingOffset?: FbxPropertyValue
  ScalingPivot?: FbxPropertyValue
  RotationOffset?: FbxPropertyValue
  RotationPivot?: FbxPropertyValue
  [key: string]: unknown
}

export interface FbxMaterialNode {
  id: number
  attrName?: string
  ShadingModel?: string | FbxPropertyValue
  Diffuse?: FbxPropertyValue
  DiffuseColor?: FbxPropertyValue
  Specular?: FbxPropertyValue
  SpecularColor?: FbxPropertyValue
  Emissive?: FbxPropertyValue
  EmissiveColor?: FbxPropertyValue
  EmissiveFactor?: FbxPropertyValue
  Shininess?: FbxPropertyValue
  Opacity?: FbxPropertyValue
  TransparencyFactor?: FbxPropertyValue
  TransparentColor?: FbxPropertyValue
  ReflectionFactor?: FbxPropertyValue
  BumpFactor?: FbxPropertyValue
  DisplacementFactor?: FbxPropertyValue
  [key: string]: unknown
}

export interface FbxTextureNode {
  id: number
  attrName?: string
  FileName?: string
  RelativeFilename?: string
  WrapModeU?: FbxPropertyValue
  WrapModeV?: FbxPropertyValue
  Scaling?: FbxPropertyValue
  Translation?: FbxPropertyValue
  [key: string]: unknown
}

export interface FbxVideoNode {
  id: number
  attrName?: string
  FileName?: string
  RelativeFilename?: string
  Content?: ArrayBuffer | string
  [key: string]: unknown
}

export interface FbxDeformerNode {
  id: number
  attrName?: string
  attrType?: string
  Indexes?: { a: Float64Array }
  Weights?: { a: Float64Array }
  TransformLink?: { a: Float64Array }
  Transform?: { a: Float64Array }
  DeformPercent?: number
  FullWeights?: { a: Float64Array }
  [key: string]: unknown
}

export interface FbxNodeAttributeNode {
  id: number
  attrName?: string
  attrType?: string
  CameraProjectionType?: FbxPropertyValue
  NearPlane?: FbxPropertyValue
  FarPlane?: FbxPropertyValue
  AspectWidth?: FbxPropertyValue
  AspectHeight?: FbxPropertyValue
  FieldOfView?: FbxPropertyValue
  FocalLength?: FbxPropertyValue
  LightType?: FbxPropertyValue
  Color?: FbxPropertyValue
  Intensity?: FbxPropertyValue
  CastShadows?: FbxPropertyValue
  CastLightOnObject?: FbxPropertyValue
  [key: string]: unknown
}

export interface FbxAnimStackNode {
  id: number
  attrName?: string
  [key: string]: unknown
}

export interface FbxAnimLayerNode {
  id: number
  attrName?: string
  [key: string]: unknown
}

export interface FbxAnimCurveNodeNode {
  id: number
  attrName?: string
  [key: string]: unknown
}

export interface FbxAnimCurveNode {
  id: number
  KeyTime?: { a: Float64Array }
  KeyValueFloat?: { a: Float64Array }
  [key: string]: unknown
}

export interface FbxPoseNode {
  id: number
  attrName?: string
  attrType?: string
  NbPoseNodes?: number
  PoseNode?: FbxPoseEntry | FbxPoseEntry[]
  [key: string]: unknown
}

export interface FbxPoseEntry {
  Node: number
  Matrix?: { a: Float64Array }
}

export type FbxConnectionTuple = [number, number, string?]

export interface FbxConnections {
  connections?: FbxConnectionTuple[]
}

export interface FbxGlobalSettings {
  UnitScaleFactor?: FbxPropertyValue
  AmbientColor?: FbxPropertyValue
  CoordAxis?: FbxPropertyValue
  CoordAxisSign?: FbxPropertyValue
  UpAxis?: FbxPropertyValue
  UpAxisSign?: FbxPropertyValue
  FrontAxis?: FbxPropertyValue
  FrontAxisSign?: FbxPropertyValue
  [key: string]: unknown
}

export interface FbxParseResult {
  format: FbxFormat
  version: number
  tree: FbxTreeData
}
