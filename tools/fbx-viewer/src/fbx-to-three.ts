import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshPhongMaterial,
  Skeleton,
  SkinnedMesh,
  Vector3,
  type EulerOrder,
  type Material,
  type Object3D,
} from 'three'
import type { FbxMesh, FbxNode, FbxScene, FbxSkin, FbxSurfaceLambert } from '@infloopgame/lib-fbx'
import { FbxLayerElementMappingMode, FbxLayerElementReferenceMode } from '@infloopgame/lib-fbx'

const DEG = Math.PI / 180

/** FBX 外旋 → three.js 内旋。见 three.js FBXLoader `getEulerOrder`. */
function getEulerOrder(order: number): EulerOrder {
  const enums: EulerOrder[] = ['ZYX', 'YZX', 'XZY', 'ZXY', 'YXZ', 'XYZ']
  return enums[order] ?? 'ZYX'
}

type TransformData = {
  translation?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
  preRotation?: [number, number, number]
  postRotation?: [number, number, number]
  rotationOffset?: [number, number, number]
  rotationPivot?: [number, number, number]
  scalingOffset?: [number, number, number]
  scalingPivot?: [number, number, number]
  eulerOrder: EulerOrder
  inheritType: number
  parentMatrix: Matrix4
  parentMatrixWorld: Matrix4
}

function maybeVec3(v: unknown): [number, number, number] | undefined {
  if (v && typeof v === 'object' && 'length' in v && Number((v as ArrayLike<number>).length) >= 3) {
    const a = v as ArrayLike<number>
    return [Number(a[0]), Number(a[1]), Number(a[2])]
  }
  return undefined
}

function generateTransform(data: TransformData): Matrix4 {
  const lTranslationM = new Matrix4()
  const lPreRotationM = new Matrix4()
  const lRotationM = new Matrix4()
  const lPostRotationM = new Matrix4()
  const lScalingM = new Matrix4()
  const lScalingPivotM = new Matrix4()
  const lScalingOffsetM = new Matrix4()
  const lRotationOffsetM = new Matrix4()
  const lRotationPivotM = new Matrix4()
  const lParentGX = data.parentMatrixWorld.clone()
  const lParentLX = data.parentMatrix.clone()
  const tempVec = new Vector3()
  const tempEuler = new Euler()
  const defaultEulerOrder = getEulerOrder(0)

  if (data.translation) lTranslationM.setPosition(tempVec.fromArray(data.translation))
  if (data.preRotation) {
    tempEuler.set(data.preRotation[0] * DEG, data.preRotation[1] * DEG, data.preRotation[2] * DEG, defaultEulerOrder)
    lPreRotationM.makeRotationFromEuler(tempEuler)
  }
  if (data.rotation) {
    tempEuler.set(data.rotation[0] * DEG, data.rotation[1] * DEG, data.rotation[2] * DEG, data.eulerOrder)
    lRotationM.makeRotationFromEuler(tempEuler)
  }
  if (data.postRotation) {
    tempEuler.set(data.postRotation[0] * DEG, data.postRotation[1] * DEG, data.postRotation[2] * DEG, defaultEulerOrder)
    lPostRotationM.makeRotationFromEuler(tempEuler).invert()
  }
  if (data.scale) lScalingM.scale(tempVec.fromArray(data.scale))
  if (data.scalingOffset) lScalingOffsetM.setPosition(tempVec.fromArray(data.scalingOffset))
  if (data.scalingPivot) lScalingPivotM.setPosition(tempVec.fromArray(data.scalingPivot))
  if (data.rotationOffset) lRotationOffsetM.setPosition(tempVec.fromArray(data.rotationOffset))
  if (data.rotationPivot) lRotationPivotM.setPosition(tempVec.fromArray(data.rotationPivot))

  const lLRM = lPreRotationM.clone().multiply(lRotationM).multiply(lPostRotationM)
  const lParentGRM = new Matrix4().extractRotation(lParentGX)
  const lParentTM = new Matrix4().copyPosition(lParentGX)
  const lParentGRSM = lParentTM.clone().invert().multiply(lParentGX)
  const lParentGSM = lParentGRM.clone().invert().multiply(lParentGRSM)
  const lLSM = lScalingM
  const lGlobalRS = new Matrix4()
  const inheritType = data.inheritType
  if (inheritType === 0) {
    lGlobalRS.copy(lParentGRM).multiply(lLRM).multiply(lParentGSM).multiply(lLSM)
  } else if (inheritType === 1) {
    lGlobalRS.copy(lParentGRM).multiply(lParentGSM).multiply(lLRM).multiply(lLSM)
  } else {
    const lParentLSM = new Matrix4().scale(new Vector3().setFromMatrixScale(lParentLX))
    const lParentGSM_noLocal = lParentGSM.clone().multiply(lParentLSM.clone().invert())
    lGlobalRS.copy(lParentGRM).multiply(lLRM).multiply(lParentGSM_noLocal).multiply(lLSM)
  }

  let lTransform = lTranslationM
    .clone()
    .multiply(lRotationOffsetM)
    .multiply(lRotationPivotM)
    .multiply(lPreRotationM)
    .multiply(lRotationM)
    .multiply(lPostRotationM)
    .multiply(lRotationPivotM.clone().invert())
    .multiply(lScalingOffsetM)
    .multiply(lScalingPivotM)
    .multiply(lScalingM)
    .multiply(lScalingPivotM.clone().invert())

  const lLocalT = new Matrix4().copyPosition(lTransform)
  const lGlobalT = new Matrix4().copyPosition(lParentGX.clone().multiply(lLocalT))
  lTransform = lGlobalT.clone().multiply(lGlobalRS)
  lTransform.premultiply(lParentGX.clone().invert())
  return lTransform
}

/** FBX 文件 16 元与 three.js FBXLoader 一样走 `fromArray`。 */
function fbxMat(a: ArrayLike<number>): Matrix4 {
  const arr = a instanceof Array ? a : Array.from(a)
  return new Matrix4().fromArray(arr)
}

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
  stats: {
    nodes: number
    meshes: number
    triangles: number
    bones: number
    clusters: number
    materials: number
  }
}

function vec3(v: unknown, fallback: [number, number, number]): [number, number, number] {
  if (Array.isArray(v) && v.length >= 3) return [Number(v[0]), Number(v[1]), Number(v[2])]
  return fallback
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function packed(el: { directArray: ArrayLike<number>; indexArray?: ArrayLike<number> } | undefined, comps: number) {
  if (!el) return null
  return { direct: el.directArray, index: el.indexArray, comps }
}

function sampleLayer(
  layer: { direct: ArrayLike<number>; index?: ArrayLike<number>; comps: number } | null,
  mapping: FbxLayerElementMappingMode,
  reference: FbxLayerElementReferenceMode,
  cp: number,
  pvi: number,
  poly: number,
): number[] {
  if (!layer) return []
  const { direct, index, comps } = layer
  let slot = 0
  if (mapping === FbxLayerElementMappingMode.eByControlPoint) slot = cp
  else if (mapping === FbxLayerElementMappingMode.eByPolygon) slot = poly
  else if (mapping === FbxLayerElementMappingMode.eAllSame) slot = 0
  else slot = pvi
  let di = slot
  if (reference === FbxLayerElementReferenceMode.eIndexToDirect || reference === FbxLayerElementReferenceMode.eIndex) {
    di = Number(index?.[slot] ?? slot)
  }
  const out: number[] = []
  for (let c = 0; c < comps; c++) out.push(Number(direct[di * comps + c] ?? 0))
  return out
}

function polygons(pvi: ArrayLike<number>): Array<{ cps: number[]; pvis: number[] }> {
  const out: Array<{ cps: number[]; pvis: number[] }> = []
  let start = 0
  for (let i = 0; i < pvi.length; i++) {
    const v = pvi[i] ?? 0
    if (v >= 0) continue
    const cps: number[] = []
    const pvis: number[] = []
    for (let j = start; j < i; j++) {
      cps.push(pvi[j] ?? 0)
      pvis.push(j)
    }
    cps.push(-v - 1)
    pvis.push(i)
    if (cps.length >= 3) out.push({ cps, pvis })
    start = i + 1
  }
  return out
}

function cpInfluences(skin: FbxSkin, cpCount: number, boneOf: Map<FbxNode, number>): Array<Array<[number, number]>> {
  const list: Array<Array<[number, number]>> = Array.from({ length: cpCount }, () => [])
  for (const cluster of skin.clusters) {
    const bone = cluster.link
    if (!bone) continue
    const bi = boneOf.get(bone)
    if (bi === undefined) continue
    const n = Math.min(cluster.indexes.length, cluster.weights.length)
    for (let i = 0; i < n; i++) {
      const cp = cluster.indexes[i] ?? 0
      const w = cluster.weights[i] ?? 0
      if (cp < 0 || cp >= cpCount || w === 0) continue
      list[cp]!.push([bi, w])
    }
  }
  return list.map((inf) => {
    inf.sort((a, b) => b[1] - a[1])
    const top = inf.slice(0, 4)
    const sum = top.reduce((s, [, w]) => s + w, 0) || 1
    return top.map(([i, w]) => [i, w / sum] as [number, number])
  })
}

function phong(node: FbxNode, index: number, vertexColors: boolean): MeshPhongMaterial {
  const mat = (node.materials[index] ?? node.materials[0]) as FbxSurfaceLambert | undefined
  const d = vec3(mat?.diffuse?.value, [0.75, 0.75, 0.75])
  const spec = vec3((mat as { specular?: { value?: unknown } } | undefined)?.specular?.value, [0.1, 0.1, 0.1])
  const shininess = num((mat as { shininess?: { value?: unknown } } | undefined)?.shininess?.value, 16)
  const opacity = num(
    (mat as { transparencyFactor?: { value?: unknown } } | undefined)?.transparencyFactor?.value,
    0,
  )
  const m = new MeshPhongMaterial({
    name: mat?.name,
    color: new Color(d[0], d[1], d[2]),
    specular: new Color(spec[0], spec[1], spec[2]),
    shininess,
    side: DoubleSide,
    vertexColors,
  })
  if (opacity > 0 && opacity < 1) {
    m.transparent = true
    m.opacity = 1 - opacity
  }
  return m
}

function convertMesh(node: FbxNode, mesh: FbxMesh, bones: Map<FbxNode, Bone>): Mesh | SkinnedMesh | null {
  const cps = mesh.controlPoints
  const cpCount = Math.floor(cps.length / 3)
  if (cpCount === 0) return null
  const polys = polygons(mesh.polygonIndexes)
  const layer = mesh.layers[0]
  const normals = packed(layer?.normals, 3)
  const uvs = packed(layer?.uvs[0], 2)
  const uv2 = packed(layer?.uvs[1], 2)
  const colors = packed(layer?.vertexColors, 4)
  const matEl = layer?.materials
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

  const pos: number[] = []
  const nrm: number[] = []
  const uv: number[] = []
  const uvB: number[] = []
  const col: number[] = []
  const sidx: number[] = []
  const sw: number[] = []
  const groups: Array<{ start: number; count: number; materialIndex: number }> = []
  let cursor = 0
  let currentMat = 0
  let groupStart = 0

  const flush = () => {
    const count = cursor - groupStart
    if (count > 0) groups.push({ start: groupStart, count, materialIndex: currentMat })
    groupStart = cursor
  }

  for (let pi = 0; pi < polys.length; pi++) {
    const poly = polys[pi]!
    const matIndex = Number(
      sampleLayer(
        matEl ? { direct: matEl.directArray, index: matEl.indexArray, comps: 1 } : null,
        matEl?.mappingMode ?? FbxLayerElementMappingMode.eAllSame,
        matEl?.referenceMode ?? FbxLayerElementReferenceMode.eIndexToDirect,
        poly.cps[0] ?? 0,
        poly.pvis[0] ?? 0,
        pi,
      )[0] ?? 0,
    )
    if (matIndex !== currentMat && cursor > 0) {
      flush()
      currentMat = matIndex
    } else {
      currentMat = matIndex
    }
    for (let k = 1; k + 1 < poly.cps.length; k++) {
      const corners = [0, k, k + 1]
      for (const c of corners) {
        const cp = poly.cps[c] ?? 0
        const pvi = poly.pvis[c] ?? 0
        pos.push(cps[cp * 3] ?? 0, cps[cp * 3 + 1] ?? 0, cps[cp * 3 + 2] ?? 0)
        const n = sampleLayer(
          normals,
          layer?.normals?.mappingMode ?? FbxLayerElementMappingMode.eByPolygonVertex,
          layer?.normals?.referenceMode ?? FbxLayerElementReferenceMode.eDirect,
          cp,
          pvi,
          pi,
        )
        if (n.length >= 3) nrm.push(n[0]!, n[1]!, n[2]!)
        const u = sampleLayer(
          uvs,
          layer?.uvs[0]?.mappingMode ?? FbxLayerElementMappingMode.eByPolygonVertex,
          layer?.uvs[0]?.referenceMode ?? FbxLayerElementReferenceMode.eIndexToDirect,
          cp,
          pvi,
          pi,
        )
        if (u.length >= 2) uv.push(u[0]!, u[1]!)
        const u2 = sampleLayer(
          uv2,
          layer?.uvs[1]?.mappingMode ?? FbxLayerElementMappingMode.eByPolygonVertex,
          layer?.uvs[1]?.referenceMode ?? FbxLayerElementReferenceMode.eIndexToDirect,
          cp,
          pvi,
          pi,
        )
        if (u2.length >= 2) uvB.push(u2[0]!, u2[1]!)
        const vc = sampleLayer(
          colors,
          layer?.vertexColors?.mappingMode ?? FbxLayerElementMappingMode.eByPolygonVertex,
          layer?.vertexColors?.referenceMode ?? FbxLayerElementReferenceMode.eIndexToDirect,
          cp,
          pvi,
          pi,
        )
        if (vc.length >= 3) col.push(vc[0]!, vc[1]!, vc[2]!)
        if (infl) {
          const inf = infl[cp] ?? []
          sidx.push(inf[0]?.[0] ?? 0, inf[1]?.[0] ?? 0, inf[2]?.[0] ?? 0, inf[3]?.[0] ?? 0)
          if (inf.length === 0) sw.push(1, 0, 0, 0)
          else sw.push(inf[0]?.[1] ?? 0, inf[1]?.[1] ?? 0, inf[2]?.[1] ?? 0, inf[3]?.[1] ?? 0)
        }
        cursor++
      }
    }
  }
  flush()
  if (pos.length === 0) return null

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  if (nrm.length === pos.length) geo.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3))
  else geo.computeVertexNormals()
  if (uv.length * 3 === pos.length * 2) geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  if (uvB.length * 3 === pos.length * 2) geo.setAttribute('uv2', new BufferAttribute(new Float32Array(uvB), 2))
  const hasColor = col.length === pos.length
  if (hasColor) geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  if (sidx.length) {
    geo.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(sidx), 4))
    geo.setAttribute('skinWeight', new BufferAttribute(new Float32Array(sw), 4))
  }
  for (const g of groups) geo.addGroup(g.start, g.count, g.materialIndex)

  const matCount = Math.max(1, ...groups.map((g) => g.materialIndex + 1), node.materials.length)
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
    threeMesh.userData.fbxSkinBind = { bones: boneList, transformLinks }
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

  // 先 Lcl 进 matrixWorld，再 bind；显式 bindMatrix，禁止 undefined 分支 calculateInverses。
  for (const mesh of meshes) {
    if (!(mesh instanceof SkinnedMesh)) continue
    const pending = mesh.userData.fbxSkinBind as
      | { bones: Bone[]; transformLinks: Array<ArrayLike<number> | undefined> }
      | undefined
    if (!pending) continue
    mesh.updateMatrixWorld(true)
    const inverses = pending.bones.map((bone, i) => {
      const link = pending.transformLinks[i]
      return link ? fbxMat(link).invert() : bone.matrixWorld.clone().invert()
    })
    mesh.bind(new Skeleton(pending.bones, inverses), mesh.matrixWorld)
    delete mesh.userData.fbxSkinBind
  }

  return {
    root,
    meshes,
    bones: [...bones.values()],
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
