import {
  Bone,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshPhongMaterial,
  SkinnedMesh,
  type Material,
  type Object3D,
} from 'three'
import type { FbxTreeData } from '@infloopgame/lib-fbx'
import { objectRef, parseConnRef, refKey, type FbxRef } from '../../../src/parse/object-ref'
import { fbxMat, generateTransform, getEulerOrder, maybeVec3 } from './fbx-transform.js'
import { bindSkin, createPhongMaterial, type ConvertStats, type SkinBinding } from './fbx-three-common.js'
import { buildMeshGeometry, buildSkinInfluences, type LayerData } from './fbx-three-geometry.js'

type Raw = Record<string, unknown>

type Conn = { id: FbxRef; relationship?: string }

type Rel = { parents: Conn[]; children: Conn[] }

type RawBone = {
  id: FbxRef
  indices: ArrayLike<number>
  weights: ArrayLike<number>
  transformLink?: ArrayLike<number>
}

type SkeletonInfo = {
  id: FbxRef
  geometryId: FbxRef
  rawBones: RawBone[]
  bones: Array<Bone | undefined>
}

export type TreeConvertResult = {
  root: Group
  meshes: Array<Mesh | SkinnedMesh>
  bones: Bone[]
  stats: ConvertStats
}

function asRaw(v: unknown): Raw | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Float64Array)) return v as Raw
  return undefined
}

function bucket(tree: FbxTreeData, section: string): Record<string, Raw> {
  const objects = asRaw(tree.Objects)
  const b = asRaw(objects?.[section])
  if (!b) return {}
  return b as Record<string, Raw>
}

function propValue(v: unknown): unknown {
  if (v && typeof v === 'object' && 'value' in (v as object)) return (v as { value: unknown }).value
  return v
}

function num(v: unknown, fallback = 0): number {
  const x = propValue(v)
  return typeof x === 'number' && Number.isFinite(x) ? x : fallback
}

function str(v: unknown): string {
  const x = propValue(v)
  if (typeof x === 'string') return x
  if (typeof x === 'number') return String(x)
  return ''
}

function vec3(v: unknown): [number, number, number] | undefined {
  return maybeVec3(propValue(v))
}

function floatArray(v: unknown): Float64Array {
  if (v instanceof Float64Array) return v
  if (Array.isArray(v)) return Float64Array.from(v.map(Number))
  const rec = asRaw(v)
  if (rec?.a instanceof Float64Array) return rec.a
  if (Array.isArray(rec?.a)) return Float64Array.from((rec.a as number[]).map(Number))
  const list = rec?.propertyList
  if (Array.isArray(list) && list.length > 0 && list.every((x) => typeof x === 'number')) {
    return Float64Array.from(list as number[])
  }
  return new Float64Array(0)
}

function collectValues(raw: unknown): Raw[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter((x): x is Raw => !!x && typeof x === 'object')
  const rec = asRaw(raw)
  if (!rec) return []
  if (
    ('MappingInformationType' in rec || 'Normals' in rec || 'UV' in rec || 'Materials' in rec) &&
    !Object.keys(rec).some((k) => /^\d+$/.test(k))
  ) {
    return [rec]
  }
  return Object.values(rec).filter((x): x is Raw => !!asRaw(x) && !(x instanceof Float64Array))
}

function parseConnections(tree: FbxTreeData): Map<string, Rel> {
  const map = new Map<string, Rel>()
  const ensure = (id: FbxRef): Rel => {
    const key = refKey(id)
    let rel = map.get(key)
    if (!rel) {
      rel = { parents: [], children: [] }
      map.set(key, rel)
    }
    return rel
  }
  const list = ((tree.Connections as { connections?: unknown[] } | undefined)?.connections ?? []) as unknown[]
  for (const entry of list) {
    if (!Array.isArray(entry) || entry.length < 2) continue
    const from = parseConnRef(entry[0])
    const to = parseConnRef(entry[1])
    if (from === undefined || to === undefined) continue
    const relationship = typeof entry[2] === 'string' ? entry[2] : undefined
    ensure(from).parents.push({ id: to, relationship })
    ensure(to).children.push({ id: from, relationship })
  }
  return map
}

function relOf(connections: Map<string, Rel>, id: FbxRef): Rel {
  return connections.get(refKey(id)) ?? { parents: [], children: [] }
}

function packLayer(el: Raw | undefined, directKey: string, indexKey: string, comps: number): LayerData | null {
  if (!el) return null
  const direct = floatArray(el[directKey])
  if (direct.length === 0 && comps !== 1) {
    const alt = floatArray(el[directKey.replace(/s$/, '')])
    if (alt.length === 0 && directKey !== 'Materials') return null
  }
  const index = floatArray(el[indexKey])
  const rawMapping = String(el.MappingInformationType ?? '')
  let mapping: LayerData['mapping'] = 'ByPolygonVertex'
  if (rawMapping === 'ByControlPoint' || rawMapping === 'ByVertice' || rawMapping === 'ByVertex') {
    mapping = 'ByControlPoint'
  } else if (rawMapping === 'ByPolygon' || rawMapping === 'AllSame') {
    mapping = rawMapping
  }
  const reference = String(el.ReferenceInformationType ?? '')
  return {
    direct: direct.length ? direct : floatArray(el[directKey]),
    index: index.length ? index : undefined,
    comps,
    mapping,
    indexed: reference === 'IndexToDirect' || reference === 'Index',
  }
}

function parsePhong(raw: Raw, vertexColors: boolean): MeshPhongMaterial {
  return createPhongMaterial({
    name: str(raw.attrName) || str(raw.name),
    diffuse: vec3(raw.DiffuseColor) ?? vec3(raw.Diffuse) ?? [0.75, 0.75, 0.75],
    specular: vec3(raw.SpecularColor) ?? vec3(raw.Specular) ?? [0.1, 0.1, 0.1],
    shininess: num(raw.ShininessExponent, num(raw.Shininess, 16)),
    transparency: num(raw.TransparencyFactor, 0),
    vertexColors,
  })
}

function parseMaterials(tree: FbxTreeData): Map<string, MeshPhongMaterial> {
  const map = new Map<string, MeshPhongMaterial>()
  for (const [key, raw] of Object.entries(bucket(tree, 'Material'))) {
    const id = objectRef(raw, key)
    if (id === undefined) continue
    map.set(refKey(id), parsePhong(raw, false))
  }
  return map
}

function parseSkeletons(tree: FbxTreeData, connections: Map<string, Rel>): Record<string, SkeletonInfo> {
  const out: Record<string, SkeletonInfo> = {}
  const deformers = bucket(tree, 'Deformer')
  for (const [key, raw] of Object.entries(deformers)) {
    if (String(raw.attrType) !== 'Skin') continue
    const id = objectRef(raw, key)
    if (id === undefined) continue
    const rel = relOf(connections, id)
    const rawBones: RawBone[] = []
    for (const child of rel.children) {
      const node = deformers[refKey(child.id)]
      if (!node || String(node.attrType) !== 'Cluster') continue
      const link = floatArray(node.TransformLink)
      rawBones.push({
        id: child.id,
        indices: floatArray(node.Indexes),
        weights: floatArray(node.Weights),
        transformLink: link.length >= 16 ? link : undefined,
      })
    }
    out[refKey(id)] = {
      id,
      geometryId: rel.parents[0]?.id ?? -1,
      rawBones,
      bones: [],
    }
  }
  return out
}

function transformDataFromModel(node: Raw, parent: Object3D): ReturnType<typeof generateTransform> {
  return generateTransform({
    translation: vec3(node.Lcl_Translation),
    rotation: vec3(node.Lcl_Rotation),
    scale: vec3(node.Lcl_Scaling),
    preRotation: vec3(node.PreRotation),
    postRotation: vec3(node.PostRotation),
    rotationOffset: vec3(node.RotationOffset),
    rotationPivot: vec3(node.RotationPivot),
    scalingOffset: vec3(node.ScalingOffset),
    scalingPivot: vec3(node.ScalingPivot),
    eulerOrder: getEulerOrder(num(node.RotationOrder, 0)),
    inheritType: num(node.InheritType, 0),
    parentMatrix: parent.matrix,
    parentMatrixWorld: parent.matrixWorld,
  })
}

function geometricMatrix(model: Raw | undefined): Matrix4 {
  if (!model) return new Matrix4()
  return generateTransform({
    translation: vec3(model.GeometricTranslation),
    rotation: vec3(model.GeometricRotation),
    scale: vec3(model.GeometricScaling),
    eulerOrder: getEulerOrder(0),
    inheritType: 0,
    parentMatrix: new Matrix4(),
    parentMatrixWorld: new Matrix4(),
  })
}

function buildGeometry(
  geoNode: Raw,
  model: Raw | undefined,
  skeleton: SkeletonInfo | undefined,
): { geo: BufferGeometry; skinned: boolean } | null {
  const cps = floatArray(geoNode.Vertices)
  const pvi = floatArray(geoNode.PolygonVertexIndex)
  const cpCount = Math.floor(cps.length / 3)
  if (cpCount === 0) return null
  const nrmEl = collectValues(geoNode.LayerElementNormal)[0]
  const uvEls = collectValues(geoNode.LayerElementUV)
  const colEl = collectValues(geoNode.LayerElementColor)[0]
  const matEl = collectValues(geoNode.LayerElementMaterial)[0]
  const normals = packLayer(nrmEl, 'Normals', 'NormalIndex', 3)
  const uvs = packLayer(uvEls[0], 'UV', 'UVIndex', 2)
  const uv2 = packLayer(uvEls[1], 'UV', 'UVIndex', 2)
  const colors = packLayer(colEl, 'Colors', 'ColorIndex', 4)
  const mats = packLayer(matEl, 'Materials', 'Materials', 1)
  const infl = skeleton && skeleton.rawBones.length > 0
    ? buildSkinInfluences(skeleton.rawBones.map((bone, boneIndex) => ({
      boneIndex, indices: bone.indices, weights: bone.weights,
    })), cpCount)
    : null
  const geo = buildMeshGeometry({
    controlPoints: cps,
    polygonIndexes: pvi,
    normals,
    uvs,
    uv2,
    colors,
    materials: mats,
    influences: infl,
  }, geometricMatrix(model))
  if (!geo) return null
  if (geoNode.attrName) geo.name = String(geoNode.attrName)
  return { geo, skinned: Boolean(infl && infl.length > 0) }
}

function parseGeometries(
  tree: FbxTreeData,
  connections: Map<string, Rel>,
  skeletons: Record<string, SkeletonInfo>,
): Map<string, { geo: BufferGeometry; skinned: boolean; skeleton?: SkeletonInfo }> {
  const map = new Map<string, { geo: BufferGeometry; skinned: boolean; skeleton?: SkeletonInfo }>()
  const models = bucket(tree, 'Model')
  for (const [key, raw] of Object.entries(bucket(tree, 'Geometry'))) {
    if (String(raw.attrType ?? 'Mesh').toLowerCase() !== 'mesh') continue
    const id = objectRef(raw, key)
    if (id === undefined) continue
    const rel = relOf(connections, id)
    const parentId = rel.parents[0]?.id
    const model = parentId === undefined ? undefined : models[refKey(parentId)]
    const skeleton = rel.children.map((c) => skeletons[refKey(c.id)]).find(Boolean)
    const built = buildGeometry(raw, model, skeleton)
    if (!built) continue
    map.set(refKey(id), { ...built, skeleton })
  }
  return map
}

function parsePoseMatrices(tree: FbxTreeData): Map<string, Matrix4> {
  const out = new Map<string, Matrix4>()
  for (const raw of Object.values(bucket(tree, 'Pose'))) {
    if (String(raw.attrType) !== 'BindPose') continue
    const nodes = raw.PoseNode
    const list = Array.isArray(nodes) ? nodes : nodes ? [nodes] : []
    for (const entry of list) {
      const rec = asRaw(entry)
      if (!rec) continue
      const nodeId = parseConnRef(rec.Node)
      const mat = floatArray(rec.Matrix)
      if (nodeId === undefined || mat.length < 16) continue
      out.set(refKey(nodeId), fbxMat(mat))
    }
  }
  return out
}

function applyLocal(obj: Object3D, node: Raw, parent: Object3D): void {
  parent.updateMatrixWorld(true)
  obj.matrix.identity()
  obj.applyMatrix4(transformDataFromModel(node, parent))
  obj.updateWorldMatrix(false, false)
  const vis = propValue(node.Visibility)
  if (typeof vis === 'number') obj.visible = vis > 1e-6
}

function findBoneForClusters(
  skeletons: Record<string, SkeletonInfo>,
  parents: Conn[],
  modelId: FbxRef,
  name: string,
): Bone | null {
  const clusterIds = new Set(parents.map((parent) => refKey(parent.id)))
  let bone: Bone | null = null
  for (const skel of Object.values(skeletons)) {
    for (let i = 0; i < skel.rawBones.length; i++) {
      if (!clusterIds.has(refKey(skel.rawBones[i]!.id))) continue
      // One scene bone per Model; each skin keeps its own inverse bind matrix.
      if (!bone) {
        bone = new Bone()
        bone.name = name
        bone.userData.fbxId = modelId
      }
      skel.bones[i] = bone
    }
  }
  return bone
}

/** 对照 three.js FBXLoader 的 FBXTreeParser：tree → Three，不走 buildScene。 */
export function fbxTreeToThree(tree: FbxTreeData): TreeConvertResult {
  const connections = parseConnections(tree)
  const materials = parseMaterials(tree)
  const skeletons = parseSkeletons(tree, connections)
  const geometries = parseGeometries(tree, connections, skeletons)
  const models = bucket(tree, 'Model')
  const modelMap = new Map<string, Object3D>()
  const bones: Bone[] = []
  const meshes: Array<Mesh | SkinnedMesh> = []
  const pendingSkins: Array<{ mesh: SkinnedMesh; skeleton: SkeletonInfo }> = []
  let clusterCount = 0

  for (const [key, node] of Object.entries(models)) {
    const id = objectRef(node, key)
    if (id === undefined) continue
    const name = str(node.attrName) || str(node.name)
    const rel = relOf(connections, id)
    let obj: Object3D | null = findBoneForClusters(skeletons, rel.parents, id, name)

    if (!obj) {
      const attr = String(node.attrType ?? '')
      if (attr === 'Mesh') {
        let geometry: BufferGeometry | undefined
        let skeleton: SkeletonInfo | undefined
        const mats: Material[] = []
        for (const child of rel.children) {
          const g = geometries.get(refKey(child.id))
          if (g) {
            geometry = g.geo
            skeleton = g.skeleton
          }
          const mat = materials.get(refKey(child.id))
          if (mat) mats.push(mat.clone())
        }
        if (!geometry) {
          obj = new Group()
        } else {
          const hasColor = Boolean(geometry.getAttribute('color'))
          if (hasColor) for (const m of mats) if ('vertexColors' in m) m.vertexColors = true
          if (mats.length === 0) {
            mats.push(
              new MeshPhongMaterial({
                color: new Color(0.75, 0.75, 0.75),
                side: DoubleSide,
                vertexColors: hasColor,
              }),
            )
          }
          const material = mats.length === 1 ? mats[0]! : mats
          const skinned = Boolean(skeleton && skeleton.rawBones.length > 0)
          const mesh = skinned ? new SkinnedMesh(geometry, material) : new Mesh(geometry, material)
          if (skinned && skeleton) pendingSkins.push({ mesh: mesh as SkinnedMesh, skeleton })
          obj = mesh
          meshes.push(mesh)
        }
      } else if (attr === 'LimbNode' || attr === 'Root') {
        obj = new Bone()
      } else {
        obj = new Group()
      }
    }

    obj.name = name
    ;(obj as Object3D & { userData: { fbxId: FbxRef } }).userData.fbxId = id
    modelMap.set(refKey(id), obj)
    if (obj.type === 'Bone') bones.push(obj as Bone)
  }

  const root = new Group()
  root.name = 'RootNode'

  for (const [id, obj] of modelMap) {
    const rel = relOf(connections, id)
    let parented = false
    for (const p of rel.parents) {
      const parent = modelMap.get(refKey(p.id))
      if (parent && parent !== obj) {
        parent.add(obj)
        parented = true
      }
    }
    if (!parented) root.add(obj)
  }

  for (const [id, obj] of modelMap) {
    const node = models[id]
    if (!node || !obj.parent) continue
    applyLocal(obj, node, obj.parent)
  }

  const pose = parsePoseMatrices(tree)
  const clustered = new Set<string>()
  for (const skel of Object.values(skeletons)) {
    for (const raw of skel.rawBones) {
      for (const [id, obj] of modelMap) {
        if (obj.type !== 'Bone') continue
        const rel = relOf(connections, id)
        if (rel.parents.some((p) => refKey(p.id) === refKey(raw.id))) clustered.add(id)
      }
    }
  }
  const temp = new Matrix4()
  root.updateMatrixWorld(true)
  for (const [id, obj] of modelMap) {
    if (obj.type !== 'Bone' || clustered.has(id)) continue
    const bindPose = pose.get(id)
    if (!bindPose) continue
    if (obj.parent) temp.copy(obj.parent.matrixWorld).invert().multiply(bindPose)
    else temp.copy(bindPose)
    temp.decompose(obj.position, obj.quaternion, obj.scale)
    obj.updateMatrix()
    obj.matrixWorld.copy(bindPose)
  }

  root.updateMatrixWorld(true)
  for (const { mesh, skeleton } of pendingSkins) {
    const boneList: Bone[] = []
    const links: Array<ArrayLike<number> | undefined> = []
    skeleton.rawBones.forEach((raw, i) => {
      const b = skeleton.bones[i]
      if (!b) return
      boneList.push(b)
      links.push(raw.transformLink)
    })
    if (boneList.length) {
      mesh.userData.fbxSkinBind = { bones: boneList, transformLinks: links } satisfies SkinBinding
      clusterCount += skeleton.rawBones.length
    }
  }
  for (const mesh of meshes) {
    if (!(mesh instanceof SkinnedMesh)) continue
    const pending = mesh.userData.fbxSkinBind as SkinBinding | undefined
    if (!pending || pending.bones.length === 0) {
      bindSkin(mesh, { bones: [], transformLinks: [] })
      continue
    }
    bindSkin(mesh, pending)
    delete mesh.userData.fbxSkinBind
  }

  const up = num((tree.GlobalSettings as Raw | undefined)?.UpAxis, 1)
  if (up === 2) {
    root.rotation.set(-Math.PI / 2, 0, 0)
    root.updateMatrixWorld(true)
  }

  let triangles = 0
  for (const mesh of meshes) {
    triangles += Math.floor((mesh.geometry.getAttribute('position')?.count ?? 0) / 3)
  }

  return {
    root,
    meshes,
    bones,
    stats: {
      nodes: modelMap.size,
      meshes: meshes.length,
      triangles,
      bones: bones.length,
      clusters: clusterCount,
      materials: materials.size,
    },
  }
}
