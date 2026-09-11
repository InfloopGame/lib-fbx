import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Matrix3,
  Matrix4,
  Mesh,
  MeshPhongMaterial,
  Skeleton,
  SkinnedMesh,
  type Material,
  type Object3D,
} from 'three'
import type { FbxTreeData } from '@infloopgame/lib-fbx'
import { fbxMat, generateTransform, getEulerOrder, maybeVec3 } from './fbx-transform.js'

type Raw = Record<string, unknown>

type Conn = { id: number; relationship?: string }

type Rel = { parents: Conn[]; children: Conn[] }

type RawBone = {
  id: number
  indices: ArrayLike<number>
  weights: ArrayLike<number>
  transformLink?: ArrayLike<number>
}

type SkeletonInfo = {
  id: number
  geometryId: number
  rawBones: RawBone[]
  bones: Array<Bone | undefined>
}

type PendingBind = { bones: Bone[]; transformLinks: Array<ArrayLike<number> | undefined> }

export type TreeConvertResult = {
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

function parseConnections(tree: FbxTreeData): Map<number, Rel> {
  const map = new Map<number, Rel>()
  const ensure = (id: number): Rel => {
    let rel = map.get(id)
    if (!rel) {
      rel = { parents: [], children: [] }
      map.set(id, rel)
    }
    return rel
  }
  const list = ((tree.Connections as { connections?: unknown[] } | undefined)?.connections ?? []) as unknown[]
  for (const entry of list) {
    if (!Array.isArray(entry) || entry.length < 2) continue
    const from = Number(entry[0])
    const to = Number(entry[1])
    const relationship = typeof entry[2] === 'string' ? entry[2] : undefined
    ensure(from).parents.push({ id: to, relationship })
    ensure(to).children.push({ id: from, relationship })
  }
  return map
}

function relOf(connections: Map<number, Rel>, id: number): Rel {
  return connections.get(id) ?? { parents: [], children: [] }
}

type LayerPack = { direct: ArrayLike<number>; index?: ArrayLike<number>; comps: number; mapping: string; reference: string }

function packLayer(el: Raw | undefined, directKey: string, indexKey: string, comps: number): LayerPack | null {
  if (!el) return null
  const direct = floatArray(el[directKey])
  if (direct.length === 0 && comps !== 1) {
    const alt = floatArray(el[directKey.replace(/s$/, '')])
    if (alt.length === 0 && directKey !== 'Materials') return null
  }
  const index = floatArray(el[indexKey])
  return {
    direct: direct.length ? direct : floatArray(el[directKey]),
    index: index.length ? index : undefined,
    comps,
    mapping: String(el.MappingInformationType ?? ''),
    reference: String(el.ReferenceInformationType ?? ''),
  }
}

function sampleLayer(
  layer: LayerPack | null,
  cp: number,
  pvi: number,
  poly: number,
): number[] {
  if (!layer) return []
  const { direct, index, comps, mapping, reference } = layer
  let slot = pvi
  if (mapping === 'ByControlPoint' || mapping === 'ByVertice' || mapping === 'ByVertex') slot = cp
  else if (mapping === 'ByPolygon') slot = poly
  else if (mapping === 'AllSame') slot = 0
  let di = slot
  if (reference === 'IndexToDirect' || reference === 'Index') di = Number(index?.[slot] ?? slot)
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

function cpInfluences(rawBones: RawBone[], cpCount: number): Array<Array<[number, number]>> {
  const list: Array<Array<[number, number]>> = Array.from({ length: cpCount }, () => [])
  rawBones.forEach((bone, bi) => {
    const n = Math.min(bone.indices.length, bone.weights.length)
    for (let i = 0; i < n; i++) {
      const cp = Number(bone.indices[i] ?? 0)
      const w = Number(bone.weights[i] ?? 0)
      if (cp < 0 || cp >= cpCount || w === 0) continue
      list[cp]!.push([bi, w])
    }
  })
  return list.map((inf) => {
    inf.sort((a, b) => b[1] - a[1])
    const top = inf.slice(0, 4)
    const sum = top.reduce((s, [, w]) => s + w, 0) || 1
    return top.map(([i, w]) => [i, w / sum] as [number, number])
  })
}

function parsePhong(raw: Raw, vertexColors: boolean): MeshPhongMaterial {
  const d = vec3(raw.DiffuseColor) ?? vec3(raw.Diffuse) ?? ([0.75, 0.75, 0.75] as [number, number, number])
  const spec = vec3(raw.SpecularColor) ?? vec3(raw.Specular) ?? ([0.1, 0.1, 0.1] as [number, number, number])
  const shininess = num(raw.ShininessExponent, num(raw.Shininess, 16))
  const opacity = num(raw.TransparencyFactor, 0)
  const m = new MeshPhongMaterial({
    color: new Color(d[0], d[1], d[2]),
    specular: new Color(spec[0], spec[1], spec[2]),
    shininess,
    side: DoubleSide,
    vertexColors,
  })
  const matName = str(raw.attrName) || str(raw.name)
  if (matName) m.name = matName
  if (opacity > 0 && opacity < 1) {
    m.transparent = true
    m.opacity = 1 - opacity
  }
  return m
}

function parseMaterials(tree: FbxTreeData): Map<number, MeshPhongMaterial> {
  const map = new Map<number, MeshPhongMaterial>()
  for (const [key, raw] of Object.entries(bucket(tree, 'Material'))) {
    const id = Number(raw.id ?? key)
    map.set(id, parsePhong(raw, false))
  }
  return map
}

function parseSkeletons(tree: FbxTreeData, connections: Map<number, Rel>): Record<number, SkeletonInfo> {
  const out: Record<number, SkeletonInfo> = {}
  const deformers = bucket(tree, 'Deformer')
  for (const [key, raw] of Object.entries(deformers)) {
    if (String(raw.attrType) !== 'Skin') continue
    const id = Number(raw.id ?? key)
    const rel = relOf(connections, id)
    const rawBones: RawBone[] = []
    for (const child of rel.children) {
      const node = deformers[String(child.id)]
      if (!node || String(node.attrType) !== 'Cluster') continue
      const link = floatArray(node.TransformLink)
      rawBones.push({
        id: child.id,
        indices: floatArray(node.Indexes),
        weights: floatArray(node.Weights),
        transformLink: link.length >= 16 ? link : undefined,
      })
    }
    out[id] = {
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
  const polys = polygons(pvi)
  const nrmEl = collectValues(geoNode.LayerElementNormal)[0]
  const uvEls = collectValues(geoNode.LayerElementUV)
  const colEl = collectValues(geoNode.LayerElementColor)[0]
  const matEl = collectValues(geoNode.LayerElementMaterial)[0]
  const normals = packLayer(nrmEl, 'Normals', 'NormalIndex', 3)
  const uvs = packLayer(uvEls[0], 'UV', 'UVIndex', 2)
  const uv2 = packLayer(uvEls[1], 'UV', 'UVIndex', 2)
  const colors = packLayer(colEl, 'Colors', 'ColorIndex', 4)
  const mats = packLayer(matEl, 'Materials', 'Materials', 1)
  const infl =
    skeleton && skeleton.rawBones.length > 0 ? cpInfluences(skeleton.rawBones, cpCount) : null

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
    const matIndex = Number(sampleLayer(mats, poly.cps[0] ?? 0, poly.pvis[0] ?? 0, pi)[0] ?? 0)
    if (matIndex !== currentMat && cursor > 0) {
      flush()
      currentMat = matIndex
    } else {
      currentMat = matIndex
    }
    for (let k = 1; k + 1 < poly.cps.length; k++) {
      for (const c of [0, k, k + 1]) {
        const cp = poly.cps[c] ?? 0
        const pv = poly.pvis[c] ?? 0
        pos.push(cps[cp * 3] ?? 0, cps[cp * 3 + 1] ?? 0, cps[cp * 3 + 2] ?? 0)
        const n = sampleLayer(normals, cp, pv, pi)
        if (n.length >= 3) nrm.push(n[0]!, n[1]!, n[2]!)
        const u = sampleLayer(uvs, cp, pv, pi)
        if (u.length >= 2) uv.push(u[0]!, u[1]!)
        const u2 = sampleLayer(uv2, cp, pv, pi)
        if (u2.length >= 2) uvB.push(u2[0]!, u2[1]!)
        const vc = sampleLayer(colors, cp, pv, pi)
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
  if (geoNode.attrName) geo.name = String(geoNode.attrName)
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  const pre = geometricMatrix(model)
  const posAttr = geo.getAttribute('position')
  posAttr.applyMatrix4(pre)
  if (nrm.length === pos.length) {
    const nAttr = new BufferAttribute(new Float32Array(nrm), 3)
    nAttr.applyNormalMatrix(new Matrix3().getNormalMatrix(pre))
    geo.setAttribute('normal', nAttr)
  } else {
    geo.computeVertexNormals()
  }
  if (uv.length * 3 === pos.length * 2) geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  if (uvB.length * 3 === pos.length * 2) geo.setAttribute('uv2', new BufferAttribute(new Float32Array(uvB), 2))
  if (col.length === pos.length) geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  if (sidx.length) {
    geo.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(sidx), 4))
    geo.setAttribute('skinWeight', new BufferAttribute(new Float32Array(sw), 4))
  }
  for (const g of groups) geo.addGroup(g.start, g.count, g.materialIndex)
  return { geo, skinned: Boolean(infl && infl.length > 0) }
}

function parseGeometries(
  tree: FbxTreeData,
  connections: Map<number, Rel>,
  skeletons: Record<number, SkeletonInfo>,
): Map<number, { geo: BufferGeometry; skinned: boolean; skeleton?: SkeletonInfo }> {
  const map = new Map<number, { geo: BufferGeometry; skinned: boolean; skeleton?: SkeletonInfo }>()
  const models = bucket(tree, 'Model')
  for (const [key, raw] of Object.entries(bucket(tree, 'Geometry'))) {
    if (String(raw.attrType ?? 'Mesh').toLowerCase() !== 'mesh') continue
    const id = Number(raw.id ?? key)
    const rel = relOf(connections, id)
    const model = models[String(rel.parents[0]?.id ?? '')]
    const skeleton = rel.children.map((c) => skeletons[c.id]).find(Boolean)
    const built = buildGeometry(raw, model, skeleton)
    if (!built) continue
    map.set(id, { ...built, skeleton })
  }
  return map
}

function parsePoseMatrices(tree: FbxTreeData): Map<number, Matrix4> {
  const out = new Map<number, Matrix4>()
  for (const raw of Object.values(bucket(tree, 'Pose'))) {
    if (String(raw.attrType) !== 'BindPose') continue
    const nodes = raw.PoseNode
    const list = Array.isArray(nodes) ? nodes : nodes ? [nodes] : []
    for (const entry of list) {
      const rec = asRaw(entry)
      if (!rec) continue
      const nodeId = Number(rec.Node)
      const mat = floatArray(rec.Matrix)
      if (!Number.isFinite(nodeId) || mat.length < 16) continue
      out.set(nodeId, fbxMat(mat))
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

function findBoneForCluster(
  skeletons: Record<number, SkeletonInfo>,
  clusterId: number,
  modelId: number,
  name: string,
): Bone | null {
  let bone: Bone | null = null
  for (const skel of Object.values(skeletons)) {
    for (let i = 0; i < skel.rawBones.length; i++) {
      if (skel.rawBones[i]!.id !== clusterId) continue
      const existing = bone
      bone = new Bone()
      bone.name = name
      ;(bone as Bone & { userData: { fbxId: number } }).userData.fbxId = modelId
      const link = skel.rawBones[i]!.transformLink
      if (link) bone.matrixWorld.copy(fbxMat(link))
      skel.bones[i] = bone
      if (existing) bone.add(existing)
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
  const modelMap = new Map<number, Object3D>()
  const bones: Bone[] = []
  const meshes: Array<Mesh | SkinnedMesh> = []
  let clusterCount = 0

  for (const [key, node] of Object.entries(models)) {
    const id = Number(node.id ?? key)
    const name = str(node.attrName) || str(node.name)
    const rel = relOf(connections, id)
    let obj: Object3D | null = null

    for (const parent of rel.parents) {
      const found = findBoneForCluster(skeletons, parent.id, id, name)
      if (found) obj = found
    }

    if (!obj) {
      const attr = String(node.attrType ?? '')
      if (attr === 'Mesh') {
        let geometry: BufferGeometry | undefined
        let skeleton: SkeletonInfo | undefined
        const mats: Material[] = []
        for (const child of rel.children) {
          const g = geometries.get(child.id)
          if (g) {
            geometry = g.geo
            skeleton = g.skeleton
          }
          const mat = materials.get(child.id)
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
          if (skinned && skeleton) {
            const boneList: Bone[] = []
            const links: Array<ArrayLike<number> | undefined> = []
            skeleton.rawBones.forEach((raw, i) => {
              const b = skeleton.bones[i]
              if (!b) return
              boneList.push(b)
              links.push(raw.transformLink)
            })
            if (boneList.length) {
              ;(mesh as SkinnedMesh).userData.fbxSkinBind = { bones: boneList, transformLinks: links } satisfies PendingBind
              clusterCount += skeleton.rawBones.length
            }
          }
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
    ;(obj as Object3D & { userData: { fbxId: number } }).userData.fbxId = id
    modelMap.set(id, obj)
    if (obj.type === 'Bone') bones.push(obj as Bone)
  }

  const root = new Group()
  root.name = 'RootNode'

  for (const [id, obj] of modelMap) {
    const rel = relOf(connections, id)
    let parented = false
    for (const p of rel.parents) {
      const parent = modelMap.get(p.id)
      if (parent) {
        parent.add(obj)
        parented = true
      }
    }
    if (!parented) root.add(obj)
  }

  for (const [id, obj] of modelMap) {
    const node = models[String(id)]
    if (!node || !obj.parent) continue
    applyLocal(obj, node, obj.parent)
  }

  const pose = parsePoseMatrices(tree)
  const clustered = new Set<number>()
  for (const skel of Object.values(skeletons)) {
    for (const raw of skel.rawBones) {
      for (const [id, obj] of modelMap) {
        if (obj.type !== 'Bone') continue
        const rel = relOf(connections, id)
        if (rel.parents.some((p) => p.id === raw.id)) clustered.add(id)
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
  for (const mesh of meshes) {
    if (!(mesh instanceof SkinnedMesh)) continue
    const pending = mesh.userData.fbxSkinBind as PendingBind | undefined
    if (!pending) continue
    mesh.updateMatrixWorld(true)
    const inverses = pending.bones.map((bone, i) => {
      const link = pending.transformLinks[i]
      return link ? fbxMat(link).invert() : bone.matrixWorld.clone().invert()
    })
    mesh.bind(new Skeleton(pending.bones, inverses), mesh.matrixWorld)
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
