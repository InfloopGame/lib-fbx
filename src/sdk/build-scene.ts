import type { FbxParseResult, FbxPropertyValue, FbxTreeData } from '../types'
import type { FbxAnimCurve, FbxAnimCurveNode, FbxAnimLayer, FbxAnimStack } from './animation'
import { FbxAnimInterpolation } from './animation'
import type { FbxConstraint } from './constraint'
import { FbxConstraintType } from './constraint'
import type { FbxCollection, FbxClassId, FbxConnection, FbxConnectionFileKind, FbxObject, FbxProperty, FbxPropertyData } from './core'
import { EFbxType, EFbxTimeMode, FbxPropertyFlags } from './core'
import type {
  FbxBlendShape,
  FbxBlendShapeChannel,
  FbxCamera,
  FbxCluster,
  FbxDeformer,
  FbxGeometry,
  FbxLayer,
  FbxLayerElement,
  FbxLight,
  FbxMesh,
  FbxNode,
  FbxNodeAttribute,
  FbxNull,
  FbxNurbsCurve,
  FbxShape,
  FbxSkeleton,
  FbxSkin,
  FbxVertexCacheDeformer,
} from './geometry'
import {
  FbxClusterLinkMode,
  FbxDeformerType,
  FbxLayerElementMappingMode,
  FbxLayerElementReferenceMode,
  FbxLayerElementType,
  FbxNodeAttributeType,
  FbxNurbsForm,
  FbxSkeletonType,
  FbxSkinningType,
  FbxSubDeformerType,
} from './geometry'
import type { FbxDouble3, FbxMatrix } from './math'
import { FbxAxisFrontVector, FbxAxisUpVector, FbxCoordSystem } from './scene'
import type {
  FbxCollectionExclusive,
  FbxDisplayLayer,
  FbxGlobalSettings,
  FbxPose,
  FbxPoseInfo,
  FbxScene,
  FbxVideo,
} from './scene'
import type { FbxFileTexture, FbxSurfaceLambert, FbxSurfaceMaterial, FbxTexture } from './shading'

type Raw = Record<string, unknown>

const IDENTITY: FbxMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

const NODE_PROP_FIELDS: Record<string, keyof FbxNode> = {
  Lcl_Translation: 'lclTranslation',
  Lcl_Rotation: 'lclRotation',
  Lcl_Scaling: 'lclScaling',
  Visibility: 'visibility',
  VisibilityInheritance: 'visibilityInheritance',
  PreRotation: 'preRotation',
  PostRotation: 'postRotation',
  RotationOrder: 'rotationOrder',
  InheritType: 'inheritType',
  GeometricTranslation: 'geometricTranslation',
  GeometricRotation: 'geometricRotation',
  GeometricScaling: 'geometricScaling',
  ScalingOffset: 'scalingOffset',
  ScalingPivot: 'scalingPivot',
  RotationOffset: 'rotationOffset',
  RotationPivot: 'rotationPivot',
  RotationActive: 'rotationActive',
  Show: 'show',
  Freeze: 'freeze',
  DefaultAttributeIndex: 'defaultAttributeIndex',
  QuaternionInterpolate: 'quaternionInterpolate',
}

/** 把 parse tree（或 `FbxParseResult`）组装成 SDK 风格的 `FbxScene`。 */
export function buildScene(input: FbxTreeData | FbxParseResult): FbxScene {
  const tree = isParseResult(input) ? input.tree : input
  const objects = (tree.Objects ?? {}) as Raw
  const created = new Map<number, FbxObject>()

  for (const [section, bucket] of Object.entries(objects)) {
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) continue
    for (const [key, value] of Object.entries(bucket as Raw)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue
      const raw = value as Raw
      const id = Number(raw.id ?? key)
      if (!Number.isFinite(id)) continue
      created.set(id, createObject(section, id, raw))
    }
  }

  const rootNode = makeNode(0, 'RootNode')
  const connections: FbxConnection[] = []
  const rawConns = ((tree.Connections as Raw | undefined)?.connections ?? []) as unknown[]

  for (const entry of rawConns) {
    if (!Array.isArray(entry) || entry.length < 2) continue
    const srcId = Number(entry[0])
    const dstId = Number(entry[1])
    const rel = typeof entry[2] === 'string' ? normalizeName(entry[2]) : undefined
    const kind: FbxConnectionFileKind = rel ? 'OP' : 'OO'
    const srcObj = created.get(srcId)
    const dstObj = dstId === 0 ? rootNode : created.get(dstId)
    if (!srcObj || !dstObj) continue

    srcObj.dstObjects.push(dstObj)
    dstObj.srcObjects.push(srcObj)

    const dstProp = rel ? findProperty(dstObj, rel) : undefined
    connections.push({
      src: srcObj,
      dst: dstProp ?? dstObj,
      type: 0,
      fileKind: kind,
    })
    if (dstProp) {
      dstProp.srcObjects = dstProp.srcObjects ?? []
      dstProp.srcObjects.push(srcObj)
    }

    wirePair(srcObj, dstObj, rel)
  }

  for (const obj of created.values()) {
    if (obj.classId !== 'FbxNode') continue
    const node = obj as FbxNode
    if (node.parent) continue
    node.parent = rootNode
    rootNode.children.push(node)
  }

  const all = [...created.values()]
  const scene: FbxScene = {
    uniqueId: -1,
    name: 'Scene',
    classId: 'FbxScene',
    objectFlags: 0,
    properties: [],
    srcObjects: [],
    dstObjects: [],
    members: [rootNode, ...all],
    roots: [rootNode],
    rootNode,
    globalSettings: buildGlobalSettings(tree.GlobalSettings as Raw | undefined),
    poses: all.filter((o): o is FbxPose => o.classId === 'FbxPose'),
    animStacks: all.filter((o): o is FbxAnimStack => o.classId === 'FbxAnimStack'),
    materials: all.filter((o): o is FbxSurfaceMaterial => isMaterial(o.classId)),
    textures: all.filter((o): o is FbxTexture => isTexture(o.classId)),
    videos: all.filter((o): o is FbxVideo => o.classId === 'FbxVideo'),
    cameras: all.filter((o): o is FbxCamera => o.classId === 'FbxCamera' || o.classId === 'FbxCameraStereo'),
    lights: all.filter((o): o is FbxLight => o.classId === 'FbxLight'),
    connections,
    documentInfo: undefined,
  }

  for (const pose of scene.poses) resolvePose(pose, created)
  return scene
}

function isParseResult(input: FbxTreeData | FbxParseResult): input is FbxParseResult {
  return 'tree' in input && 'format' in input && 'version' in input
}

function createObject(section: string, id: number, raw: Raw): FbxObject {
  const name = String(raw.attrName ?? raw.name ?? '')
  const attrType = String(raw.attrType ?? '')

  if (section === 'Model') return makeNode(id, name, raw)
  if (section === 'Geometry') return makeGeometry(id, name, attrType, raw)
  if (section === 'NodeAttribute') return makeNodeAttribute(id, name, attrType, raw)
  if (section === 'Material') return makeMaterial(id, name, raw)
  if (section === 'CollectionExclusive') return makeDisplayLayer(id, name, raw)
  if (section === 'Texture') return makeTexture(id, name, raw)
  if (section === 'Video') return makeVideo(id, name, raw)
  if (section === 'Deformer') return makeDeformer(id, name, attrType, raw)
  if (section === 'AnimationStack') return makeAnimStack(id, name, raw)
  if (section === 'AnimationLayer') return makeAnimLayer(id, name, raw)
  if (section === 'AnimationCurveNode') return makeAnimCurveNode(id, name, raw)
  if (section === 'AnimationCurve') return makeAnimCurve(id, name, raw)
  if (section === 'Pose') return makePose(id, name, attrType, raw)
  if (section === 'Constraint') return makeConstraint(id, name, attrType, raw)
  return makeBase(id, name, 'FbxObject')
}

function makeBase<C extends FbxClassId>(uniqueId: number, name: string, classId: C): FbxObject & { classId: C } {
  return {
    uniqueId,
    name,
    classId,
    objectFlags: 0,
    properties: [],
    srcObjects: [],
    dstObjects: [],
  }
}

function makeNode(id: number, name: string, raw: Raw = {}): FbxNode {
  const node: FbxNode = {
    ...makeBase(id, name, 'FbxNode'),
    parent: null,
    children: [],
    nodeAttributes: [],
    materials: [],
  }
  applyNamedProps(node, raw)
  applyUserProps(node, raw, new Set(Object.keys(NODE_PROP_FIELDS)))
  return node
}

function makeGeometry(id: number, name: string, attrType: string, raw: Raw): FbxObject {
  const t = attrType.toLowerCase()
  if (t === 'nurbscurve') {
    const curve: FbxNurbsCurve = {
      ...makeBase(id, name, 'FbxNurbsCurve'),
      classId: 'FbxNurbsCurve',
      attributeType: FbxNodeAttributeType.eNurbsCurve,
      nodes: [],
      layers: [],
      controlPoints: floatArray(raw.Points ?? raw.Vertices),
      deformers: [],
      order: num(raw.Order) ?? 2,
      form: parseNurbsForm(raw.Form),
      knotVector: floatArray(raw.KnotVector),
    }
    return curve
  }
  if (t === 'shape') {
    const shape: FbxShape = {
      ...makeBase(id, name, 'FbxShape'),
      classId: 'FbxShape',
      attributeType: FbxNodeAttributeType.eShape,
      nodes: [],
      layers: [],
      controlPoints: floatArray(raw.Vertices ?? raw.Points),
    }
    return shape
  }
  const mesh: FbxMesh = {
    ...makeBase(id, name, 'FbxMesh'),
    classId: 'FbxMesh',
    attributeType: FbxNodeAttributeType.eMesh,
    nodes: [],
    layers: buildLayers(raw),
    controlPoints: floatArray(raw.Vertices ?? raw.Points),
    deformers: [],
    polygonIndexes: floatArray(raw.PolygonVertexIndex),
  }
  return mesh
}

function makeNodeAttribute(id: number, name: string, attrType: string, raw: Raw): FbxNodeAttribute {
  const t = attrType.toLowerCase()
  const base = {
    ...makeBase(id, name, 'FbxNull'),
    nodes: [] as FbxNode[],
    color: makeProp<FbxDouble3>('Color', raw.Color),
  }
  if (t === 'camera' || t === 'camerastereo') {
    return {
      ...base,
      classId: t === 'camerastereo' ? 'FbxCameraStereo' : 'FbxCamera',
      attributeType: t === 'camerastereo' ? FbxNodeAttributeType.eCameraStereo : FbxNodeAttributeType.eCamera,
      fieldOfView: makeProp<number>('FieldOfView', raw.FieldOfView ?? raw.FieldOfViewX),
      nearPlane: makeProp<number>('NearPlane', raw.NearPlane),
      farPlane: makeProp<number>('FarPlane', raw.FarPlane),
      aspectWidth: makeProp<number>('AspectWidth', raw.AspectWidth),
      aspectHeight: makeProp<number>('AspectHeight', raw.AspectHeight),
      focalLength: makeProp<number>('FocalLength', raw.FocalLength),
      projectionType: makeProp<number>('CameraProjectionType', raw.CameraProjectionType),
    } as FbxCamera
  }
  if (t === 'light') {
    return {
      ...base,
      classId: 'FbxLight',
      attributeType: FbxNodeAttributeType.eLight,
      lightType: makeProp<number>('LightType', raw.LightType),
      intensity: makeProp<number>('Intensity', raw.Intensity),
      castShadows: makeProp<boolean>('CastShadows', raw.CastShadows),
      innerAngle: makeProp<number>('InnerAngle', raw.InnerAngle),
      outerAngle: makeProp<number>('OuterAngle', raw.OuterAngle),
    } as FbxLight
  }
  if (t === 'limbnode' || t === 'limb' || t === 'root' || t === 'effector' || t === 'skeleton') {
    return {
      ...base,
      classId: 'FbxSkeleton',
      attributeType: FbxNodeAttributeType.eSkeleton,
      skeletonType: skeletonType(t),
      size: makeProp<number>('Size', raw.Size),
      limbLength: makeProp<number>('LimbLength', raw.LimbLength),
    } as FbxSkeleton
  }
  if (t === 'marker') {
    return { ...base, classId: 'FbxMarker', attributeType: FbxNodeAttributeType.eMarker }
  }
  if (t === 'cameraswitcher') {
    return { ...base, classId: 'FbxCameraSwitcher', attributeType: FbxNodeAttributeType.eCameraSwitcher }
  }
  if (t === 'lodgroup') {
    return { ...base, classId: 'FbxLODGroup', attributeType: FbxNodeAttributeType.eLODGroup }
  }
  return {
    ...base,
    classId: 'FbxNull',
    attributeType: FbxNodeAttributeType.eNull,
    size: makeProp<number>('Size', raw.Size),
    look: makeProp('Look', raw.Look),
  } as FbxNull
}

function makeMaterial(id: number, name: string, raw: Raw): FbxSurfaceMaterial {
  const shading = String(propValue(raw.ShadingModel) ?? raw.ShadingModel ?? 'phong').toLowerCase()
  const classId = shading === 'lambert' ? 'FbxSurfaceLambert' : 'FbxSurfacePhong'
  const mat = {
    ...makeBase(id, name, classId),
    classId,
  } as FbxSurfaceLambert

  const bind = (field: string | undefined, propName: string, rawKey: string) => {
    if (!(rawKey in raw)) return
    const p = makeProp(propName, raw[rawKey])
    if (!p) return
    if (field && (mat as unknown as Record<string, unknown>)[field] == null) {
      ;(mat as unknown as Record<string, unknown>)[field] = p
    }
    mat.properties.push(p)
  }

  bind('shadingModel', 'ShadingModel', 'ShadingModel')
  bind('emissive', 'EmissiveColor', 'EmissiveColor')
  bind('emissive', 'Emissive', 'Emissive')
  bind('ambient', 'AmbientColor', 'AmbientColor')
  bind('ambient', 'Ambient', 'Ambient')
  bind('diffuse', 'DiffuseColor', 'DiffuseColor')
  bind('diffuse', 'Diffuse', 'Diffuse')
  bind('specular', 'SpecularColor', 'SpecularColor')
  bind('specular', 'Specular', 'Specular')
  bind('shininess', 'ShininessExponent', 'ShininessExponent')
  bind('shininess', 'Shininess', 'Shininess')
  bind('transparencyFactor', 'TransparencyFactor', 'TransparencyFactor')
  bind('bumpFactor', 'BumpFactor', 'BumpFactor')
  bind(undefined, 'EmissiveFactor', 'EmissiveFactor')
  bind(undefined, 'AmbientFactor', 'AmbientFactor')
  bind(undefined, 'DiffuseFactor', 'DiffuseFactor')
  bind(undefined, 'SpecularFactor', 'SpecularFactor')
  bind(undefined, 'Opacity', 'Opacity')
  bind(undefined, 'ReflectionFactor', 'ReflectionFactor')
  bind(undefined, 'ReflectionColor', 'ReflectionColor')
  bind(undefined, 'MultiLayer', 'MultiLayer')
  bind(undefined, 'Bump', 'Bump')
  bind(undefined, 'NormalMap', 'NormalMap')
  bind(undefined, 'TransparentColor', 'TransparentColor')
  bind(undefined, 'DisplacementColor', 'DisplacementColor')
  bind(undefined, 'DisplacementFactor', 'DisplacementFactor')
  bind(undefined, 'VectorDisplacementColor', 'VectorDisplacementColor')
  bind(undefined, 'VectorDisplacementFactor', 'VectorDisplacementFactor')

  const defaults: Array<[string, string | undefined, unknown]> = [
    ['EmissiveColor', 'emissive', [0, 0, 0]],
    ['EmissiveFactor', undefined, 0],
    ['AmbientFactor', undefined, 1],
    ['DiffuseFactor', undefined, 1],
    ['BumpFactor', 'bumpFactor', 1],
    ['TransparencyFactor', 'transparencyFactor', 0],
    ['TransparentColor', undefined, [1, 1, 1]],
    ['ReflectionColor', undefined, [0, 0, 0]],
    ['ReflectionFactor', undefined, 1],
    ['DisplacementColor', undefined, [0, 0, 0]],
    ['DisplacementFactor', undefined, 1],
    ['VectorDisplacementColor', undefined, [0, 0, 0]],
    ['VectorDisplacementFactor', undefined, 1],
    ['Bump', undefined, [0, 0, 0]],
    ['NormalMap', undefined, [0, 0, 0]],
    ['MultiLayer', undefined, false],
  ]
  for (const [propName, field, fallback] of defaults) {
    if (mat.properties.some((p) => p.name === propName)) continue
    const p = makeProp(propName, fallback)
    if (!p) continue
    if (field && (mat as unknown as Record<string, unknown>)[field] == null) {
      ;(mat as unknown as Record<string, unknown>)[field] = p
    }
    mat.properties.push(p)
  }
  return mat
}

function makeDisplayLayer(id: number, name: string, raw: Raw): FbxDisplayLayer | FbxCollectionExclusive {
  const attrType = String(raw.attrType ?? '').toLowerCase()
  if (attrType && attrType !== 'displaylayer') {
    return {
      ...makeBase(id, name, 'FbxCollectionExclusive'),
      classId: 'FbxCollectionExclusive',
      members: [],
    }
  }
  const layer: FbxDisplayLayer = {
    ...makeBase(id, name, 'FbxDisplayLayer'),
    classId: 'FbxDisplayLayer',
    members: [],
  }
  const color = makeProp('Color', raw.Color)
  if (color) layer.properties.push(color)
  const show = makeProp('Show', raw.Show ?? true)
  if (show) layer.properties.push(show)
  const freeze = makeProp('Freeze', raw.Freeze ?? false)
  if (freeze) layer.properties.push(freeze)
  return layer
}

function makeTexture(id: number, name: string, raw: Raw): FbxFileTexture {
  return {
    ...makeBase(id, name, 'FbxFileTexture'),
    classId: 'FbxFileTexture',
    fileName: str(propValue(raw.FileName) ?? raw.FileName),
    relativeFileName: str(propValue(raw.RelativeFilename) ?? raw.RelativeFilename),
    wrapModeU: makeProp('WrapModeU', raw.WrapModeU),
    wrapModeV: makeProp('WrapModeV', raw.WrapModeV),
    scaling: makeProp('Scaling', raw.Scaling),
    translation: makeProp('Translation', raw.Translation),
    uvSet: makeProp('UVSet', raw.UVSet),
  }
}

function makeVideo(id: number, name: string, raw: Raw): FbxVideo {
  return {
    ...makeBase(id, name, 'FbxVideo'),
    classId: 'FbxVideo',
    fileName: str(propValue(raw.FileName) ?? raw.FileName ?? raw.Filename ?? raw.Path),
    relativeFileName: str(propValue(raw.RelativeFilename) ?? raw.RelativeFilename ?? raw.RelPath),
    content: asContent(raw.Content),
  }
}

function makeDeformer(id: number, name: string, attrType: string, raw: Raw): FbxObject {
  const t = attrType.toLowerCase()
  if (t === 'cluster') {
    const cluster: FbxCluster = {
      ...makeBase(id, name, 'FbxCluster'),
      classId: 'FbxCluster',
      subDeformerType: FbxSubDeformerType.eCluster,
      linkMode: parseLinkMode(raw.Mode),
      indexes: floatArray(raw.Indexes),
      weights: floatArray(raw.Weights),
      transform: asMatrix(raw.Transform),
      transformLink: asMatrix(raw.TransformLink),
    }
    return cluster
  }
  if (t === 'blendshape') {
    const bs: FbxBlendShape = {
      ...makeBase(id, name, 'FbxBlendShape'),
      classId: 'FbxBlendShape',
      deformerType: FbxDeformerType.eBlendShape,
      channels: [],
    }
    return bs
  }
  if (t === 'blendshapechannel') {
    const ch: FbxBlendShapeChannel = {
      ...makeBase(id, name, 'FbxBlendShapeChannel'),
      classId: 'FbxBlendShapeChannel',
      subDeformerType: FbxSubDeformerType.eBlendShapeChannel,
      deformPercent: num(raw.DeformPercent),
      targetShapes: [],
    }
    return ch
  }
  if (t === 'vertexcache') {
    const cache: FbxVertexCacheDeformer = {
      ...makeBase(id, name, 'FbxVertexCacheDeformer'),
      classId: 'FbxVertexCacheDeformer',
      deformerType: FbxDeformerType.eVertexCache,
    }
    return cache
  }
  const skin: FbxSkin = {
    ...makeBase(id, name, 'FbxSkin'),
    classId: 'FbxSkin',
    deformerType: FbxDeformerType.eSkin,
    skinningType: parseSkinningType(raw.SkinningType),
    clusters: [],
  }
  return skin
}

function makeAnimStack(id: number, name: string, raw: Raw): FbxAnimStack {
  return {
    ...makeBase(id, name, 'FbxAnimStack'),
    classId: 'FbxAnimStack',
    members: [],
    layers: [],
    description: makeProp('Description', raw.Description),
    localStart: makeProp('LocalStart', raw.LocalStart),
    localStop: makeProp('LocalStop', raw.LocalStop),
    referenceStart: makeProp('ReferenceStart', raw.ReferenceStart),
    referenceStop: makeProp('ReferenceStop', raw.ReferenceStop),
  }
}

function makeAnimLayer(id: number, name: string, raw: Raw): FbxAnimLayer {
  return {
    ...makeBase(id, name, 'FbxAnimLayer'),
    classId: 'FbxAnimLayer',
    members: [],
    weight: makeProp('Weight', raw.Weight),
    mute: makeProp('Mute', raw.Mute),
  }
}

function makeAnimCurveNode(id: number, name: string, raw: Raw): FbxAnimCurveNode {
  const channels: FbxAnimCurveNode['channels'] = []
  for (const [key, value] of Object.entries(raw)) {
    if (!key.includes('|')) continue
    const pv = value as FbxPropertyValue
    channels.push({ name: key, value: Number(pv?.value ?? 0) })
  }
  return {
    ...makeBase(id, name, 'FbxAnimCurveNode'),
    classId: 'FbxAnimCurveNode',
    channels,
  }
}

function makeAnimCurve(id: number, name: string, raw: Raw): FbxAnimCurve {
  const times = floatArray(raw.KeyTime)
  const values = floatArray(raw.KeyValueFloat)
  const flags = floatArray(raw.KeyAttrFlags)
  const keys = []
  const n = Math.min(times.length, values.length)
  for (let i = 0; i < n; i++) {
    const flag = flags[Math.min(i, Math.max(flags.length - 1, 0))] ?? 0
    keys.push({
      time: { ticks: times[i] ?? 0 },
      value: values[i] ?? 0,
      interpolation: interpolationFromFlag(flag),
    })
  }
  return {
    ...makeBase(id, name, 'FbxAnimCurve'),
    classId: 'FbxAnimCurve',
    keys,
  }
}

function makePose(id: number, name: string, attrType: string, raw: Raw): FbxPose {
  return {
    ...makeBase(id, name, 'FbxPose'),
    classId: 'FbxPose',
    bindPose: /bind/i.test(attrType) || /bind/i.test(name),
    restPose: /rest/i.test(attrType),
    poseInfos: collectValues(raw.PoseNode).map((entry) => ({
      node: undefined as unknown as FbxNode,
      nodeId: Number(entry.Node ?? entry.id),
      matrix: asMatrix(entry.Matrix) ?? IDENTITY,
      matrixIsLocal: false,
    })) as unknown as FbxPoseInfo[],
  }
}

function makeConstraint(id: number, name: string, attrType: string, raw: Raw): FbxConstraint {
  const t = attrType.toLowerCase()
  const constraintType =
    t === 'aim'
      ? FbxConstraintType.eAim
      : t === 'position'
        ? FbxConstraintType.ePosition
        : t === 'parent'
          ? FbxConstraintType.eParent
          : t === 'rotation'
            ? FbxConstraintType.eRotation
            : t === 'scale'
              ? FbxConstraintType.eScale
              : t === 'character'
                ? FbxConstraintType.eCharacter
                : FbxConstraintType.eCustom
  const classId: FbxClassId =
    t === 'aim'
      ? 'FbxConstraintAim'
      : t === 'position'
        ? 'FbxConstraintPosition'
        : t === 'parent'
          ? 'FbxConstraintParent'
          : t === 'rotation'
            ? 'FbxConstraintRotation'
            : t === 'scale'
              ? 'FbxConstraintScale'
              : t === 'character'
                ? 'FbxCharacter'
                : 'FbxConstraintCustom'
  return {
    ...makeBase(id, name, classId),
    classId,
    constraintType,
    constraintSources: [],
    weight: makeProp<number>('Weight', raw.Weight),
  } as FbxConstraint
}

function wirePair(src: FbxObject, dst: FbxObject, rel?: string): void {
  if (src.classId === 'FbxNode' && dst.classId === 'FbxNode') {
    const child = src as FbxNode
    const parent = dst as FbxNode
    if (child.parent && child.parent.uniqueId !== 0 && child.parent !== parent) return
    if (child.parent?.uniqueId === 0) {
      child.parent.children = child.parent.children.filter((n) => n !== child)
    }
    child.parent = parent
    if (!parent.children.includes(child)) parent.children.push(child)
    return
  }

  if (src.classId === 'FbxNode' && (dst.classId === 'FbxDisplayLayer' || dst.classId === 'FbxCollectionExclusive')) {
    const col = dst as FbxCollection
    if (!col.members.includes(src)) col.members.push(src)
    return
  }

  if ((src.classId === 'FbxDisplayLayer' || src.classId === 'FbxCollectionExclusive') && dst.classId === 'FbxNode') {
    const col = src as FbxCollection
    if (!col.members.includes(dst)) col.members.push(dst)
    return
  }

  if (isNodeAttr(src) && dst.classId === 'FbxNode') {
    const node = dst as FbxNode
    const attr = src as FbxNodeAttribute
    if (!node.nodeAttributes.includes(attr)) node.nodeAttributes.push(attr)
    if (!attr.nodes.includes(node)) attr.nodes.push(node)
    return
  }

  if (isMaterial(src.classId) && dst.classId === 'FbxNode') {
    const node = dst as FbxNode
    const mat = src as FbxSurfaceMaterial
    if (!node.materials.includes(mat)) node.materials.push(mat)
    return
  }

  if (isTexture(src.classId) && isMaterial(dst.classId)) return

  if (src.classId === 'FbxVideo' && isTexture(dst.classId)) {
    ;(dst as FbxFileTexture).media = src
    return
  }

  if (isDeformer(src) && isGeometry(dst)) {
    const geo = dst as FbxGeometry
    const def = src as FbxDeformer
    if (!geo.deformers.includes(def)) geo.deformers.push(def)
    return
  }

  if (src.classId === 'FbxCluster' && dst.classId === 'FbxSkin') {
    const skin = dst as FbxSkin
    const cluster = src as FbxCluster
    if (!skin.clusters.includes(cluster)) skin.clusters.push(cluster)
    return
  }

  if (src.classId === 'FbxNode' && dst.classId === 'FbxCluster') {
    ;(dst as FbxCluster).link = src as FbxNode
    return
  }

  if (src.classId === 'FbxCluster' && dst.classId === 'FbxNode') {
    ;(src as FbxCluster).link = dst as FbxNode
    return
  }

  if (src.classId === 'FbxBlendShapeChannel' && dst.classId === 'FbxBlendShape') {
    const bs = dst as FbxBlendShape
    const ch = src as FbxBlendShapeChannel
    if (!bs.channels.includes(ch)) bs.channels.push(ch)
    return
  }

  if (src.classId === 'FbxShape' && dst.classId === 'FbxBlendShapeChannel') {
    const ch = dst as FbxBlendShapeChannel
    ch.targetShapes.push({ shape: src as FbxShape, fullWeight: 100 })
    return
  }

  if (src.classId === 'FbxAnimLayer' && dst.classId === 'FbxAnimStack') {
    const stack = dst as FbxAnimStack
    const layer = src as FbxAnimLayer
    if (!stack.layers.includes(layer)) stack.layers.push(layer)
    if (!stack.members.includes(layer)) stack.members.push(layer)
    return
  }

  if (src.classId === 'FbxAnimCurveNode' && dst.classId === 'FbxAnimLayer') {
    const layer = dst as FbxAnimLayer
    if (!layer.members.includes(src)) layer.members.push(src)
    return
  }

  if (src.classId === 'FbxAnimCurve' && dst.classId === 'FbxAnimCurveNode' && rel) {
    const node = dst as FbxAnimCurveNode
    let ch = node.channels.find((c) => normalizeName(c.name) === rel || c.name === rel)
    if (!ch) {
      ch = { name: rel, value: 0 }
      node.channels.push(ch)
    }
    ch.curve = src as FbxAnimCurve
  }
}

function resolvePose(pose: FbxPose, created: Map<number, FbxObject>): void {
  const infos: FbxPoseInfo[] = []
  for (const info of pose.poseInfos as Array<FbxPoseInfo & { nodeId?: number }>) {
    const node = created.get(Number(info.nodeId))
    if (node?.classId !== 'FbxNode') continue
    infos.push({ node: node as FbxNode, matrix: info.matrix, matrixIsLocal: info.matrixIsLocal })
  }
  pose.poseInfos = infos
}

function buildLayers(raw: Raw): FbxLayer[] {
  const layer: FbxLayer = { uvs: [] }
  const normals = firstLayerElem(raw.LayerElementNormal, FbxLayerElementType.eNormal, 'Normals', 'NormalIndex')
  if (normals) layer.normals = normals as FbxLayerElement<never>
  const tangents = firstLayerElem(raw.LayerElementTangent, FbxLayerElementType.eTangent, 'Tangents', 'TangentIndex')
  if (tangents) layer.tangents = tangents as FbxLayerElement<never>
  const binormals = firstLayerElem(raw.LayerElementBinormal, FbxLayerElementType.eBiNormal, 'Binormals', 'BinormalIndex')
  if (binormals) layer.binormals = binormals as FbxLayerElement<never>
  for (const uv of collectValues(raw.LayerElementUV)) {
    layer.uvs.push(layerElemFrom(uv, FbxLayerElementType.eUV, 'UV', 'UVIndex') as FbxLayerElement<never>)
  }
  const colors = firstLayerElem(raw.LayerElementColor, FbxLayerElementType.eVertexColor, 'Colors', 'ColorIndex')
  if (colors) layer.vertexColors = colors as FbxLayerElement<never>
  const mats = firstLayerElem(raw.LayerElementMaterial, FbxLayerElementType.eMaterial, 'Materials', 'MaterialIndex')
  if (mats) layer.materials = mats
  const smooth = firstLayerElem(raw.LayerElementSmoothing, FbxLayerElementType.eSmoothing, 'Smoothing')
  if (smooth) layer.smoothing = smooth
  if (
    !layer.normals &&
    !layer.tangents &&
    layer.uvs.length === 0 &&
    !layer.materials &&
    !layer.smoothing &&
    !layer.vertexColors
  ) {
    return []
  }
  return [layer]
}

function firstLayerElem(
  raw: unknown,
  type: FbxLayerElementType,
  directKey: string,
  indexKey?: string,
): FbxLayerElement | undefined {
  const first = collectValues(raw)[0]
  return first ? layerElemFrom(first, type, directKey, indexKey) : undefined
}

function layerElemFrom(
  raw: Raw,
  type: FbxLayerElementType,
  directKey: string,
  indexKey?: string,
): FbxLayerElement {
  const indexArray = indexKey ? floatArray(raw[indexKey]) : new Float64Array(0)
  return {
    type,
    name: str(raw.Name) || undefined,
    mappingMode: parseMapping(String(raw.MappingInformationType ?? '')),
    referenceMode: parseReference(String(raw.ReferenceInformationType ?? '')),
    directArray: floatArray(raw[directKey]),
    indexArray: indexArray.length > 0 ? indexArray : undefined,
  }
}

function buildGlobalSettings(raw: Raw | undefined): FbxGlobalSettings {
  const upAxis = Math.round(num(propValue(raw?.UpAxis)) ?? 1)
  const frontAxis = Math.round(num(propValue(raw?.FrontAxis)) ?? 2)
  const upSign = (num(propValue(raw?.UpAxisSign)) ?? 1) < 0 ? -1 : 1
  const frontSign = (num(propValue(raw?.FrontAxisSign)) ?? 1) < 0 ? -1 : 1
  const coordSign = num(propValue(raw?.CoordAxisSign)) ?? 1
  const ambient = asDouble3(propValue(raw?.AmbientColor))
  const scale = num(propValue(raw?.UnitScaleFactor)) ?? 1
  const timeMode = num(propValue(raw?.TimeMode))
  return {
    ...makeBase(-2, 'GlobalSettings', 'FbxGlobalSettings'),
    classId: 'FbxGlobalSettings',
    axisSystem: {
      upVector: Math.min(3, Math.max(1, upAxis + 1)) as FbxAxisUpVector,
      upSign,
      frontVector: frontParity(upAxis, frontAxis),
      frontSign,
      coordSystem: coordSign < 0 ? FbxCoordSystem.eLeftHanded : FbxCoordSystem.eRightHanded,
    },
    originalUpAxis: num(propValue(raw?.OriginalUpAxis)),
    systemUnit: { scaleFactor: scale, multiplier: 1 },
    ambientColor: ambient ? { r: ambient[0], g: ambient[1], b: ambient[2], a: 1 } : undefined,
    defaultCamera: str(propValue(raw?.DefaultCamera)),
    timeMode: timeMode === undefined ? undefined : (timeMode as EFbxTimeMode),
    timeProtocol: num(propValue(raw?.TimeProtocol)),
    customFrameRate: num(propValue(raw?.CustomFrameRate)),
  }
}

const STRUCTURAL_RAW_KEYS = new Set([
  'id',
  'attrName',
  'attrType',
  'name',
  'Version',
  'propertyList',
  'singleProperty',
])

function applyUserProps(obj: FbxObject, raw: Raw, extraSkip: Set<string>): void {
  for (const [key, val] of Object.entries(raw)) {
    if (STRUCTURAL_RAW_KEYS.has(key) || extraSkip.has(key)) continue
    if (!isPropValue(val) && typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') continue
    if (obj.properties.some((p) => p.name === key)) continue
    const p = makeProp(key, val)
    if (p) obj.properties.push(p)
  }
}

function applyNamedProps(target: FbxNode, raw: Raw): void {
  for (const [key, field] of Object.entries(NODE_PROP_FIELDS)) {
    if (!(key in raw) && !(key.replace('_', ' ') in raw)) continue
    const rawVal = raw[key] ?? raw[key.replace('_', ' ')]
    const prop = makeProp(key, rawVal)
    if (!prop) continue
    ;(target as unknown as Record<string, unknown>)[field] = prop
    target.properties.push(prop)
  }
}

function makeProp<T extends FbxPropertyData>(name: string, raw: unknown): FbxProperty<T> | undefined {
  if (raw === undefined || raw === null) return undefined
  const pv = isPropValue(raw) ? raw : { type: '', value: raw }
  const flags = String(pv.flag ?? '').includes('A') ? FbxPropertyFlags.eAnimatable : FbxPropertyFlags.eNone
  return {
    name,
    dataType: typeFromName(String(pv.type ?? name)),
    flags,
    value: convertValue(pv.value, String(pv.type ?? name)) as T,
  }
}

function findProperty(obj: FbxObject, rel: string): FbxProperty | undefined {
  const want = normalizeName(rel)
  for (const p of obj.properties) {
    if (normalizeName(p.name) === want) return p
  }
  const node = obj as FbxNode
  for (const [treeName, field] of Object.entries(NODE_PROP_FIELDS)) {
    if (normalizeName(treeName) !== want) continue
    const value = node[field]
    if (value && typeof value === 'object' && 'dataType' in (value as object)) return value as FbxProperty
  }
  if (obj.classId === 'FbxAnimCurveNode') {
    const curveNode = obj as FbxAnimCurveNode
    const ch = curveNode.channels.find((c) => normalizeName(c.name) === want)
    if (ch) {
      const prop: FbxProperty<number> = {
        name: ch.name,
        dataType: EFbxType.eFbxDouble,
        flags: FbxPropertyFlags.eAnimatable,
        value: ch.value,
      }
      obj.properties.push(prop)
      return prop
    }
  }
  return undefined
}

function convertValue(value: unknown, type: string): FbxPropertyData {
  const t = type.toLowerCase()
  if (t === 'ktime' || t === 'time') return { ticks: Number(value) || 0 }
  if (t === 'bool') return Boolean(value) && value !== 0
  const d3 = asDouble3(value)
  if (d3 && (t.includes('vector') || t.includes('color') || t.includes('lcl_'))) return d3
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value
  if (Array.isArray(value) && value.length >= 3) return asDouble3(value) ?? 0
  return value as FbxPropertyData
}

function typeFromName(type: string): EFbxType {
  const t = type.toLowerCase()
  if (t === 'bool') return EFbxType.eFbxBool
  if (t === 'int' || t === 'integer') return EFbxType.eFbxInt
  if (t === 'enum') return EFbxType.eFbxEnum
  if (t === 'ktime' || t === 'time') return EFbxType.eFbxTime
  if (t === 'kstring' || t === 'string') return EFbxType.eFbxString
  if (t.includes('vector') || t.includes('color') || t.includes('lcl_')) return EFbxType.eFbxDouble3
  return EFbxType.eFbxDouble
}

function parseMapping(s: string): FbxLayerElementMappingMode {
  if (s === 'ByControlPoint') return FbxLayerElementMappingMode.eByControlPoint
  if (s === 'ByPolygonVertex') return FbxLayerElementMappingMode.eByPolygonVertex
  if (s === 'ByPolygon') return FbxLayerElementMappingMode.eByPolygon
  if (s === 'ByEdge') return FbxLayerElementMappingMode.eByEdge
  if (s === 'AllSame') return FbxLayerElementMappingMode.eAllSame
  return FbxLayerElementMappingMode.eNone
}

function parseReference(s: string): FbxLayerElementReferenceMode {
  if (s === 'IndexToDirect') return FbxLayerElementReferenceMode.eIndexToDirect
  if (s === 'Index') return FbxLayerElementReferenceMode.eIndex
  return FbxLayerElementReferenceMode.eDirect
}

function parseNurbsForm(v: unknown): FbxNurbsForm {
  const s = String(v ?? 'Open').toLowerCase()
  if (s === 'periodic') return FbxNurbsForm.ePeriodic
  if (s === 'closed') return FbxNurbsForm.eClosed
  return FbxNurbsForm.eOpen
}

function parseSkinningType(v: unknown): FbxSkinningType {
  const raw = propValue(v) ?? v
  const s = String(raw ?? '').toLowerCase().replace(/[\s_]/g, '')
  if (s === 'rigid' || s === '0') return FbxSkinningType.eRigid
  if (s === 'dualquaternion' || s === '2') return FbxSkinningType.eDualQuaternion
  if (s === 'blend' || s === '3') return FbxSkinningType.eBlend
  if (typeof raw === 'number') {
    if (raw === FbxSkinningType.eRigid) return FbxSkinningType.eRigid
    if (raw === FbxSkinningType.eDualQuaternion) return FbxSkinningType.eDualQuaternion
    if (raw === FbxSkinningType.eBlend) return FbxSkinningType.eBlend
  }
  return FbxSkinningType.eLinear
}

function parseLinkMode(v: unknown): FbxClusterLinkMode {
  const raw = propValue(v) ?? v
  const s = String(raw ?? '').toLowerCase().replace(/[\s_]/g, '')
  if (s === 'additive' || s === '1') return FbxClusterLinkMode.eAdditive
  if (s === 'totalone' || s === '2') return FbxClusterLinkMode.eTotalOne
  if (typeof raw === 'number') {
    if (raw === FbxClusterLinkMode.eAdditive) return FbxClusterLinkMode.eAdditive
    if (raw === FbxClusterLinkMode.eTotalOne) return FbxClusterLinkMode.eTotalOne
  }
  return FbxClusterLinkMode.eNormalize
}

function skeletonType(t: string): FbxSkeletonType {
  if (t === 'root') return FbxSkeletonType.eRoot
  if (t === 'limb') return FbxSkeletonType.eLimb
  if (t === 'effector') return FbxSkeletonType.eEffector
  return FbxSkeletonType.eLimbNode
}

function interpolationFromFlag(flag: number): FbxAnimInterpolation {
  if (flag & FbxAnimInterpolation.eInterpolationLinear) return FbxAnimInterpolation.eInterpolationLinear
  if (flag & FbxAnimInterpolation.eInterpolationConstant) return FbxAnimInterpolation.eInterpolationConstant
  return FbxAnimInterpolation.eInterpolationCubic
}

function frontParity(upAxis: number, frontAxis: number): FbxAxisFrontVector {
  const rem = [0, 1, 2].filter((a) => a !== upAxis)
  return rem[1] === frontAxis ? FbxAxisFrontVector.eParityOdd : FbxAxisFrontVector.eParityEven
}

function isNodeAttr(obj: FbxObject): boolean {
  return 'attributeType' in obj && obj.classId !== 'FbxNode'
}

function isGeometry(obj: FbxObject): boolean {
  return 'deformers' in obj
}

function isDeformer(obj: FbxObject): boolean {
  return obj.classId === 'FbxSkin' || obj.classId === 'FbxBlendShape' || obj.classId === 'FbxVertexCacheDeformer'
}

function isMaterial(id: FbxClassId): boolean {
  return id === 'FbxSurfaceMaterial' || id === 'FbxSurfaceLambert' || id === 'FbxSurfacePhong'
}

function isTexture(id: FbxClassId): boolean {
  return (
    id === 'FbxTexture' ||
    id === 'FbxFileTexture' ||
    id === 'FbxLayeredTexture' ||
    id === 'FbxProceduralTexture'
  )
}

function collectValues(raw: unknown): Raw[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter((x): x is Raw => !!x && typeof x === 'object')
  if (typeof raw !== 'object') return []
  const rec = raw as Raw
  if ('MappingInformationType' in rec || 'Node' in rec || 'Normals' in rec || 'UV' in rec || 'Materials' in rec) {
    if (!hasNumericKeys(rec)) return [rec]
  }
  return Object.values(rec).filter(
    (x): x is Raw => !!x && typeof x === 'object' && !Array.isArray(x) && !(x instanceof Float64Array),
  )
}

function hasNumericKeys(rec: Raw): boolean {
  return Object.keys(rec).some((k) => /^\d+$/.test(k))
}

function floatArray(v: unknown): Float64Array {
  if (v instanceof Float64Array) return v
  if (Array.isArray(v)) return Float64Array.from(v.map(Number))
  if (v && typeof v === 'object' && (v as Raw).a instanceof Float64Array) return (v as { a: Float64Array }).a
  if (v && typeof v === 'object' && Array.isArray((v as Raw).a)) {
    return Float64Array.from(((v as Raw).a as number[]).map(Number))
  }
  return new Float64Array(0)
}

function asMatrix(v: unknown): FbxMatrix | undefined {
  const a = floatArray(v)
  if (a.length < 16) return a.length === 0 ? undefined : IDENTITY
  return [
    a[0]!,
    a[1]!,
    a[2]!,
    a[3]!,
    a[4]!,
    a[5]!,
    a[6]!,
    a[7]!,
    a[8]!,
    a[9]!,
    a[10]!,
    a[11]!,
    a[12]!,
    a[13]!,
    a[14]!,
    a[15]!,
  ]
}

function asDouble3(v: unknown): FbxDouble3 | undefined {
  if (!Array.isArray(v) || v.length < 3) return undefined
  return [Number(v[0]), Number(v[1]), Number(v[2])]
}

function asContent(v: unknown): ArrayBuffer | undefined {
  if (v instanceof ArrayBuffer) return v
  if (typeof v === 'string' && v.length > 0) {
    try {
      const bin = globalThis.atob(v)
      const out = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
      return out.buffer
    } catch {
      return undefined
    }
  }
  return undefined
}

function isPropValue(v: unknown): v is FbxPropertyValue {
  return !!v && typeof v === 'object' && 'value' in (v as object) && 'type' in (v as object)
}

function propValue(v: unknown): unknown {
  if (isPropValue(v)) return v.value
  return v
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v))) return Number(v)
  if (typeof v === 'boolean') return v ? 1 : 0
  return undefined
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  return undefined
}

function normalizeName(s: string): string {
  return s.replace(/^"+|"+$/g, '').trim().replace(/ /g, '_')
}
