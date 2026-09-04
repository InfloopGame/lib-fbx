import type { FbxClassId, FbxObject } from './core'
import type { FbxAnimCurve, FbxAnimCurveNode, FbxAnimLayer, FbxAnimStack } from './animation'
import type { FbxCluster, FbxMesh, FbxNode, FbxSkin } from './geometry'
import type { FbxScene } from './scene'
import type { FbxSurfacePhong } from './shading'

export const FBX_CLASS_IDS = [
  'FbxObject',
  'FbxCollection',
  'FbxCollectionExclusive',
  'FbxContainer',
  'FbxDocument',
  'FbxScene',
  'FbxDocumentInfo',
  'FbxLibrary',
  'FbxDisplayLayer',
  'FbxSelectionSet',
  'FbxSelectionNode',
  'FbxThumbnail',
  'FbxMediaClip',
  'FbxVideo',
  'FbxAudio',
  'FbxAudioLayer',
  'FbxPose',
  'FbxSceneReference',
  'FbxObjectMetaData',
  'FbxEnvironment',
  'FbxGlobalSettings',
  'FbxNode',
  'FbxNodeAttribute',
  'FbxNull',
  'FbxMarker',
  'FbxSkeleton',
  'FbxCamera',
  'FbxCameraStereo',
  'FbxCameraSwitcher',
  'FbxLight',
  'FbxOpticalReference',
  'FbxLODGroup',
  'FbxCachedEffect',
  'FbxLayerContainer',
  'FbxGeometryBase',
  'FbxGeometry',
  'FbxMesh',
  'FbxNurbs',
  'FbxNurbsCurve',
  'FbxNurbsSurface',
  'FbxTrimNurbsSurface',
  'FbxBoundary',
  'FbxPatch',
  'FbxLine',
  'FbxSubDiv',
  'FbxShape',
  'FbxProceduralGeometry',
  'FbxDeformer',
  'FbxSkin',
  'FbxBlendShape',
  'FbxVertexCacheDeformer',
  'FbxSubDeformer',
  'FbxCluster',
  'FbxBlendShapeChannel',
  'FbxCache',
  'FbxGenericNode',
  'FbxSurfaceMaterial',
  'FbxSurfaceLambert',
  'FbxSurfacePhong',
  'FbxTexture',
  'FbxFileTexture',
  'FbxLayeredTexture',
  'FbxProceduralTexture',
  'FbxImplementation',
  'FbxBindingTable',
  'FbxBindingOperator',
  'FbxAnimStack',
  'FbxAnimLayer',
  'FbxAnimCurveNode',
  'FbxAnimCurve',
  'FbxAnimCurveBase',
  'FbxConstraint',
  'FbxConstraintAim',
  'FbxConstraintCustom',
  'FbxConstraintParent',
  'FbxConstraintPosition',
  'FbxConstraintRotation',
  'FbxConstraintScale',
  'FbxConstraintSingleChainIK',
  'FbxCharacter',
  'FbxCharacterPose',
  'FbxControlSetPlug',
] as const satisfies readonly FbxClassId[]

export function isFbxClass<K extends FbxClassId>(obj: FbxObject, classId: K): obj is FbxObject & { classId: K } {
  return obj.classId === classId
}

export function isFbxScene(obj: FbxObject): obj is FbxScene {
  return obj.classId === 'FbxScene'
}

export function isFbxNode(obj: FbxObject): obj is FbxNode {
  return obj.classId === 'FbxNode'
}

export function isFbxMesh(obj: FbxObject): obj is FbxMesh {
  return obj.classId === 'FbxMesh'
}

export function isFbxSurfacePhong(obj: FbxObject): obj is FbxSurfacePhong {
  return obj.classId === 'FbxSurfacePhong'
}

export function isFbxSkin(obj: FbxObject): obj is FbxSkin {
  return obj.classId === 'FbxSkin'
}

export function isFbxCluster(obj: FbxObject): obj is FbxCluster {
  return obj.classId === 'FbxCluster'
}

export function isFbxAnimStack(obj: FbxObject): obj is FbxAnimStack {
  return obj.classId === 'FbxAnimStack'
}

export function isFbxAnimLayer(obj: FbxObject): obj is FbxAnimLayer {
  return obj.classId === 'FbxAnimLayer'
}

export function isFbxAnimCurveNode(obj: FbxObject): obj is FbxAnimCurveNode {
  return obj.classId === 'FbxAnimCurveNode'
}

export function isFbxAnimCurve(obj: FbxObject): obj is FbxAnimCurve {
  return obj.classId === 'FbxAnimCurve'
}
