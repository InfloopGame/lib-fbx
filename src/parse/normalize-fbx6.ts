/**
 * 将 FBX 6.x 节点树规范化为 7.x 结构
 * 6.x 中几何数据内嵌在 Model 节点内，需要拆分为独立 Geometry 节点
 */
import { parseConnRef, refKey } from './object-ref'
import type { FbxTree } from '../util'

type AnyRecord = Record<string, unknown>

const GEO_KEYS = [
  'Vertices',
  'PolygonVertexIndex',
  'Normals',
  'LayerElementNormal',
  'LayerElementTangent',
  'LayerElementUV',
  'LayerElementMaterial',
  'LayerElementColor',
  'UV',
  'UVIndex',
  'NormalIndex',
  'NormalsIndex',
  'Materials',
  'Colors',
  'ColorIndex',
  'Layer',
  'Edges',
  'GeometryVersion',
]

const ARRAY_DATA_KEYS = new Set([
  'Vertices',
  'PolygonVertexIndex',
  'Edges',
  'Normals',
  'NormalIndex',
  'NormalsIndex',
  'UV',
  'UVIndex',
  'Materials',
  'Colors',
  'ColorIndex',
  'KeyTime',
  'KeyValueFloat',
  'Indexes',
  'Weights',
  'TransformLink',
  'Transform',
  'Matrix',
  'FullWeights',
])

export function normalizeFbx6Tree(tree: FbxTree): void {
  const objects = (tree as AnyRecord).Objects as AnyRecord | undefined
  if (!objects) return

  if (!objects.Geometry) objects.Geometry = {}
  if (!objects.Model) objects.Model = {}

  walk(tree as unknown as AnyRecord)

  let syntheticGeoId = 900000
  const embeddedModelGeoIds = new Map<string, number>()

  const models = objects.Model as AnyRecord
  for (const modelId in models) {
    const modelNode = models[modelId] as AnyRecord
    if (typeof modelNode !== 'object' || modelNode === null || Array.isArray(modelNode)) continue
    if (!('attrName' in modelNode || 'propertyList' in modelNode || 'attrType' in modelNode)) continue

    const hasEmbeddedGeo = GEO_KEYS.some((k) => k in modelNode)
    if (!hasEmbeddedGeo) continue

    const geoId = syntheticGeoId++
    const geoNode: AnyRecord = {
      id: geoId,
      attrName: ((modelNode.attrName as string) || '') + 'Geometry',
      attrType: 'Mesh',
      name: 'Geometry',
    }

    for (const k of GEO_KEYS) {
      if (k in modelNode) {
        geoNode[k] = modelNode[k]
        delete modelNode[k]
      }
    }

    ;(objects.Geometry as AnyRecord)[geoId] = geoNode
    const modelRef = parseConnRef(modelId) ?? modelId
    embeddedModelGeoIds.set(refKey(modelRef), geoId)

    if (!(tree as AnyRecord).Connections) (tree as AnyRecord).Connections = {}
    const conn = (tree as AnyRecord).Connections as AnyRecord
    if (!conn.connections) conn.connections = []
    ;(conn.connections as unknown[]).push([geoId, modelRef])
  }

  if (embeddedModelGeoIds.size > 0 && objects.Deformer && (tree as AnyRecord).Connections) {
    const connections = ((tree as AnyRecord).Connections as AnyRecord).connections as unknown[][] | undefined
    const deformers = objects.Deformer as AnyRecord
    if (connections) {
      for (const c of connections) {
        const fromRef = parseConnRef(c[0])
        const toRef = parseConnRef(c[1])
        if (fromRef === undefined || toRef === undefined) continue
        const deformer = (deformers[fromRef] ?? deformers[refKey(fromRef)]) as AnyRecord | undefined

        if (!deformer || (deformer.attrType !== 'Skin' && deformer.attrType !== 'BlendShape')) continue
        const geoId = embeddedModelGeoIds.get(refKey(toRef))
        if (geoId === undefined) continue
        c[1] = geoId
      }
    }
  }

  if (objects.Video) {
    const videos = objects.Video as AnyRecord
    for (const vid in videos) {
      const v = videos[vid] as AnyRecord
      if (typeof v !== 'object' || v === null) continue
      if (!v.FileName && !v.RelativeFilename && v.attrName) {
        v.FileName = v.attrName
        v.RelativeFilename = v.attrName
      }
    }
  }

  if (objects.Texture) {
    const textures = objects.Texture as AnyRecord
    for (const tid in textures) {
      const t = textures[tid] as AnyRecord
      if (typeof t !== 'object' || t === null) continue
      if (!t.FileName && t.attrName) t.FileName = t.attrName
    }
  }
}

function normalizeArrayDataNode(parent: AnyRecord, key: string): void {
  const child = parent[key] as AnyRecord | undefined
  if (!child || typeof child !== 'object') return
  if (child.a !== undefined) return

  const list = child.propertyList as unknown[] | undefined
  if (!Array.isArray(list) || list.length === 0) return
  if (list[0] instanceof Float64Array) {
    child.a = list[0]
    return
  }
  if (typeof list[0] === 'number') {
    child.a = Float64Array.from(list as number[])
  }
}

function walk(node: AnyRecord): void {
  if (!node || typeof node !== 'object') return
  for (const key of Object.keys(node)) {
    if (ARRAY_DATA_KEYS.has(key)) normalizeArrayDataNode(node, key)
    const child = node[key]
    if (child && typeof child === 'object' && key !== 'propertyList') {
      walk(child as AnyRecord)
    }
  }
}
