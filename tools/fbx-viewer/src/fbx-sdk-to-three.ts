import {
  Bone,
  Group,
  Matrix4,
  Mesh,
  SkinnedMesh,
  type Material,
  type MeshPhongMaterial,
  type Object3D,
} from 'three'
import type { FbxLayerElement, FbxMesh, FbxNode, FbxScene, FbxSkin, FbxSurfaceLambert } from '@infloopgame/lib-fbx'
import { FbxLayerElementMappingMode, FbxLayerElementReferenceMode } from '@infloopgame/lib-fbx'
import { threeEulerForFbxYUp } from './axis-y-up'
import { DEG, fbxMat, generateTransform, getEulerOrder, maybeVec3 } from './fbx-transform.js'
import { bindSkin, createPhongMaterial, type ConvertStats, type SkinBinding } from './fbx-three-common.js'
import { buildMeshGeometry, buildSkinInfluences, type LayerData, type SkinClusterData } from './fbx-three-geometry.js'

function applyLocal(obj: Object3D, node: FbxNode, parent: Object3D): void {
  parent.updateMatrixWorld(true)
  const m = generateTransform({
    translation: maybeVec3(node.lclTranslation?.value),
    rotation: maybeVec3(node.lclRotation?.value),
    scale: maybeVec3(node.lclScaling?.value),
    preRotation: maybeVec3(node.preRotation?.value),
    postRotation: maybeVec3(node.postRotation?.value),
    rotationOffset: maybeVec3(node.rotationOffset?.value),
    rotationPivot: maybeVec3(node.rotationPivot?.value),
    scalingOffset: maybeVec3(node.scalingOffset?.value),
    scalingPivot: maybeVec3(node.scalingPivot?.value),
    eulerOrder: getEulerOrder(Number(node.rotationOrder?.value ?? 0)),
    inheritType: Number(node.inheritType?.value ?? 0),
    parentMatrix: parent.matrix,
    parentMatrixWorld: parent.matrixWorld,
  })
  obj.matrix.identity()
  obj.applyMatrix4(m)
  obj.updateWorldMatrix(false, false)
  const vis = node.visibility?.value
  if (typeof vis === 'number') obj.visible = vis > 1e-6
}

export type ConvertResult = {
  root: Group
  meshes: Array<Mesh | SkinnedMesh>
  bones: Bone[]
  nodeMap: Map<FbxNode, Object3D>
  stats: ConvertStats
}

function vec3(v: unknown, fallback: [number, number, number]): [number, number, number] {
  if (Array.isArray(v) && v.length >= 3) return [Number(v[0]), Number(v[1]), Number(v[2])]
  return fallback
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function packed(el: FbxLayerElement<unknown> | undefined, comps: number): LayerData | null {
  if (!el) return null
  let mapping: LayerData['mapping'] = 'ByPolygonVertex'
  if (el.mappingMode === FbxLayerElementMappingMode.eByControlPoint) mapping = 'ByControlPoint'
  else if (el.mappingMode === FbxLayerElementMappingMode.eByPolygon) mapping = 'ByPolygon'
  else if (el.mappingMode === FbxLayerElementMappingMode.eAllSame) mapping = 'AllSame'
  return {
    direct: el.directArray as ArrayLike<number>,
    index: el.indexArray,
    comps,
    mapping,
    indexed: el.referenceMode === FbxLayerElementReferenceMode.eIndexToDirect ||
      el.referenceMode === FbxLayerElementReferenceMode.eIndex,
  }
}

function cpInfluences(skin: FbxSkin, cpCount: number, boneOf: Map<FbxNode, number>) {
  const clusters: SkinClusterData[] = []
  for (const cluster of skin.clusters) {
    const boneIndex = cluster.link ? boneOf.get(cluster.link) : undefined
    if (boneIndex === undefined) continue
    clusters.push({ boneIndex, indices: cluster.indexes, weights: cluster.weights })
  }
  return buildSkinInfluences(clusters, cpCount)
}

function phong(node: FbxNode, index: number, vertexColors: boolean): MeshPhongMaterial {
  const mat = (node.materials[index] ?? node.materials[0]) as FbxSurfaceLambert | undefined
  return createPhongMaterial({
    name: mat?.name,
    diffuse: vec3(mat?.diffuse?.value, [0.75, 0.75, 0.75]),
    specular: vec3((mat as { specular?: { value?: unknown } } | undefined)?.specular?.value, [0.1, 0.1, 0.1]),
    shininess: num((mat as { shininess?: { value?: unknown } } | undefined)?.shininess?.value, 16),
    transparency: num(
      (mat as { transparencyFactor?: { value?: unknown } } | undefined)?.transparencyFactor?.value,
      0,
    ),
    vertexColors,
  })
}

function convertMesh(node: FbxNode, mesh: FbxMesh, bones: Map<FbxNode, Bone>): Mesh | SkinnedMesh | null {
  const cpCount = Math.floor(mesh.controlPoints.length / 3)
  if (cpCount === 0) return null
  const layer = mesh.layers[0]
  const skin = mesh.deformers.find((d): d is FbxSkin => d.classId === 'FbxSkin')

  const boneList: Bone[] = []
  const transformLinks: Array<ArrayLike<number> | undefined> = []
  const boneIndex = new Map<FbxNode, number>()
  if (skin) {
    for (const c of skin.clusters) {
      const link = c.link
      if (!link) continue
      const bone = bones.get(link)
      if (!bone || boneIndex.has(link)) continue
      boneIndex.set(link, boneList.length)
      boneList.push(bone)
      transformLinks.push(c.transformLink)
    }
  }
  const infl = skin && boneList.length > 0 ? cpInfluences(skin, cpCount, boneIndex) : null
  const geo = buildMeshGeometry({
    controlPoints: mesh.controlPoints,
    polygonIndexes: mesh.polygonIndexes,
    normals: packed(layer?.normals, 3),
    uvs: packed(layer?.uvs[0], 2),
    uv2: packed(layer?.uvs[1], 2),
    colors: packed(layer?.vertexColors, 4),
    materials: packed(layer?.materials, 1),
    influences: infl,
  })
  if (!geo) return null

  const hasColor = Boolean(geo.getAttribute('color'))
  const matCount = Math.max(1, ...geo.groups.map((g) => (g.materialIndex ?? 0) + 1), node.materials.length)
  const materials: Material[] = []
  for (let i = 0; i < matCount; i++) materials.push(phong(node, i, hasColor))
  const mat = materials.length === 1 ? materials[0]! : materials

  const gt = vec3(node.geometricTranslation?.value, [0, 0, 0])
  const gr = vec3(node.geometricRotation?.value, [0, 0, 0])
  const gs = vec3(node.geometricScaling?.value, [1, 1, 1])
  const threeMesh = infl && boneList.length > 0 ? new SkinnedMesh(geo, mat) : new Mesh(geo, mat)
  threeMesh.name = mesh.name || node.name
  threeMesh.position.set(gt[0], gt[1], gt[2])
  threeMesh.rotation.set(gr[0] * DEG, gr[1] * DEG, gr[2] * DEG)
  threeMesh.scale.set(gs[0], gs[1], gs[2])
  if (threeMesh instanceof SkinnedMesh) {
    threeMesh.userData.fbxSkinBind = { bones: boneList, transformLinks } satisfies SkinBinding
  }
  return threeMesh
}

function applyBindPose(
  scene: FbxScene,
  attachments: Array<{ node: FbxNode; obj: Object3D }>,
  clustered: Set<FbxNode>,
): void {
  const byNode = new Map(attachments.map((a) => [a.node, a.obj]))
  const temp = new Matrix4()
  for (const pose of scene.poses) {
    if (!pose.bindPose) continue
    for (const info of pose.poseInfos) {
      const obj = byNode.get(info.node)
      if (!obj || obj.type !== 'Bone' || clustered.has(info.node) || !info.matrix) continue
      const bindPose = fbxMat(info.matrix)
      if (!info.matrixIsLocal && obj.parent) {
        temp.copy(obj.parent.matrixWorld).invert().multiply(bindPose)
      } else {
        temp.copy(bindPose)
      }
      temp.decompose(obj.position, obj.quaternion, obj.scale)
      obj.updateMatrix()
      if (!info.matrixIsLocal) obj.matrixWorld.copy(bindPose)
    }
  }
}

export function fbxSceneToThree(scene: FbxScene): ConvertResult {
  const root = new Group()
  root.name = scene.rootNode.name || 'RootNode'
  const bones = new Map<FbxNode, Bone>()
  const attachments: Array<{ node: FbxNode; obj: Object3D }> = []
  let nodeCount = 0

  const walk = (fbx: FbxNode, parent: Object3D) => {
    nodeCount++
    const isBone = fbx.nodeAttributes.some((a) => a.classId === 'FbxSkeleton')
    const obj: Object3D = isBone ? new Bone() : new Group()
    obj.name = fbx.name
    parent.add(obj)
    applyLocal(obj, fbx, parent)
    if (isBone) bones.set(fbx, obj as Bone)
    attachments.push({ node: fbx, obj })
    for (const child of fbx.children) walk(child, obj)
  }

  for (const child of scene.rootNode.children) walk(child, root)

  const meshes: Array<Mesh | SkinnedMesh> = []
  let triangles = 0
  let clusterCount = 0
  for (const { node, obj } of attachments) {
    for (const attr of node.nodeAttributes) {
      if (attr.classId !== 'FbxMesh') continue
      const mesh = convertMesh(node, attr as FbxMesh, bones)
      if (!mesh) continue
      obj.add(mesh)
      meshes.push(mesh)
      triangles += Math.floor((mesh.geometry.getAttribute('position')?.count ?? 0) / 3)
      const skin = (attr as FbxMesh).deformers.find((d): d is FbxSkin => d.classId === 'FbxSkin')
      clusterCount += skin?.clusters.length ?? 0
    }
  }

  const clustered = new Set<FbxNode>()
  for (const { node } of attachments) {
    for (const attr of node.nodeAttributes) {
      if (attr.classId !== 'FbxMesh') continue
      const skin = (attr as FbxMesh).deformers.find((d): d is FbxSkin => d.classId === 'FbxSkin')
      for (const c of skin?.clusters ?? []) {
        if (c.link) clustered.add(c.link)
      }
    }
  }

  root.updateMatrixWorld(true)
  applyBindPose(scene, attachments, clustered)
  root.updateMatrixWorld(true)

  for (const mesh of meshes) {
    if (!(mesh instanceof SkinnedMesh)) continue
    const pending = mesh.userData.fbxSkinBind as SkinBinding | undefined
    if (!pending) continue
    bindSkin(mesh, pending)
    delete mesh.userData.fbxSkinBind
  }

  const yUp = threeEulerForFbxYUp(scene.globalSettings.axisSystem.upVector)
  if (yUp) {
    root.rotation.set(yUp[0], yUp[1], yUp[2])
    root.updateMatrixWorld(true)
  }

  const nodeMap = new Map<FbxNode, Object3D>(attachments.map((a) => [a.node, a.obj]))
  nodeMap.set(scene.rootNode, root)

  return {
    root,
    meshes,
    bones: [...bones.values()],
    nodeMap,
    stats: {
      nodes: nodeCount,
      meshes: meshes.length,
      triangles,
      bones: bones.size,
      clusters: clusterCount,
      materials: scene.materials.length,
    },
  }
}
