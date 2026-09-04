export * from './math'
export * from './core'
export * from './scene'
export * from './geometry'
export * from './shading'
export * from './animation'
export * from './constraint'
export * from './guards'
export * from './build-scene'


import type { FbxAnimCurve, FbxAnimCurveBase, FbxAnimCurveNode, FbxAnimLayer, FbxAnimStack } from './animation'
import type { FbxCollection, FbxObject } from './core'
import type {
  FbxCharacter,
  FbxCharacterPose,
  FbxConstraint,
  FbxConstraintAim,
  FbxConstraintCustom,
  FbxConstraintParent,
  FbxConstraintPosition,
  FbxConstraintRotation,
  FbxConstraintScale,
  FbxConstraintSingleChainIK,
  FbxControlSetPlug,
} from './constraint'
import type {
  FbxBlendShape,
  FbxBlendShapeChannel,
  FbxBoundary,
  FbxCache,
  FbxCachedEffect,
  FbxCamera,
  FbxCameraStereo,
  FbxCameraSwitcher,
  FbxCluster,
  FbxDeformer,
  FbxGenericNode,
  FbxGeometry,
  FbxGeometryBase,
  FbxLayerContainer,
  FbxLight,
  FbxLine,
  FbxLODGroup,
  FbxMarker,
  FbxMesh,
  FbxNode,
  FbxNodeAttribute,
  FbxNull,
  FbxNurbs,
  FbxNurbsCurve,
  FbxNurbsSurface,
  FbxOpticalReference,
  FbxPatch,
  FbxProceduralGeometry,
  FbxShape,
  FbxSkeleton,
  FbxSkin,
  FbxSubDeformer,
  FbxSubDiv,
  FbxTrimNurbsSurface,
  FbxVertexCacheDeformer,
} from './geometry'
import type {
  FbxAudio,
  FbxAudioLayer,
  FbxCollectionExclusive,
  FbxContainer,
  FbxDisplayLayer,
  FbxDocument,
  FbxDocumentInfo,
  FbxEnvironment,
  FbxGlobalSettings,
  FbxLibrary,
  FbxMediaClip,
  FbxObjectMetaData,
  FbxPose,
  FbxScene,
  FbxSceneReference,
  FbxSelectionNode,
  FbxSelectionSet,
  FbxThumbnail,
  FbxVideo,
} from './scene'
import type {
  FbxBindingOperator,
  FbxBindingTable,
  FbxFileTexture,
  FbxImplementation,
  FbxLayeredTexture,
  FbxProceduralTexture,
  FbxSurfaceLambert,
  FbxSurfaceMaterial,
  FbxSurfacePhong,
  FbxTexture,
} from './shading'

export type FbxAnyObject =
  | FbxObject
  | FbxCollection
  | FbxDocument
  | FbxScene
  | FbxDocumentInfo
  | FbxLibrary
  | FbxDisplayLayer
  | FbxSelectionSet
  | FbxSelectionNode
  | FbxThumbnail
  | FbxMediaClip
  | FbxVideo
  | FbxAudio
  | FbxAudioLayer
  | FbxPose
  | FbxSceneReference
  | FbxObjectMetaData
  | FbxEnvironment
  | FbxGlobalSettings
  | FbxContainer
  | FbxCollectionExclusive
  | FbxNode
  | FbxNodeAttribute
  | FbxNull
  | FbxMarker
  | FbxSkeleton
  | FbxCamera
  | FbxCameraStereo
  | FbxCameraSwitcher
  | FbxLight
  | FbxOpticalReference
  | FbxLODGroup
  | FbxCachedEffect
  | FbxLayerContainer
  | FbxGeometryBase
  | FbxGeometry
  | FbxMesh
  | FbxNurbs
  | FbxNurbsCurve
  | FbxNurbsSurface
  | FbxTrimNurbsSurface
  | FbxBoundary
  | FbxPatch
  | FbxLine
  | FbxSubDiv
  | FbxShape
  | FbxProceduralGeometry
  | FbxDeformer
  | FbxSkin
  | FbxBlendShape
  | FbxVertexCacheDeformer
  | FbxSubDeformer
  | FbxCluster
  | FbxBlendShapeChannel
  | FbxCache
  | FbxGenericNode
  | FbxSurfaceMaterial
  | FbxSurfaceLambert
  | FbxSurfacePhong
  | FbxTexture
  | FbxFileTexture
  | FbxLayeredTexture
  | FbxProceduralTexture
  | FbxImplementation
  | FbxBindingTable
  | FbxBindingOperator
  | FbxAnimStack
  | FbxAnimLayer
  | FbxAnimCurveNode
  | FbxAnimCurve
  | FbxAnimCurveBase
  | FbxConstraint
  | FbxConstraintAim
  | FbxConstraintCustom
  | FbxConstraintParent
  | FbxConstraintPosition
  | FbxConstraintRotation
  | FbxConstraintScale
  | FbxConstraintSingleChainIK
  | FbxCharacter
  | FbxCharacterPose
  | FbxControlSetPlug
