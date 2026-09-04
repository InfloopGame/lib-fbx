/**
 * 从 Autodesk SDK dump JSON 生成测试用 gold。
 * 跳过轴转换结果：localTransform、cluster.Transform、typed.axisSystem。
 *
 *   pnpm exec tsx tools/fbx-dump/generate-gold.mts [dump.json] [out.json]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

type DumpObj = {
  uniqueId: number
  name: string
  classId: string
  properties: Array<{ name: string; value: unknown }>
  typed?: Record<string, unknown>
}

type DumpConn = { kind: string; src: number; dst: number; srcProp?: string; dstProp?: string }

function dumpVal(v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as { index?: number; ticks?: number }
    if (typeof o.index === 'number') return o.index
    if (typeof o.ticks === 'number') return o.ticks
  }
  return v
}

function prop(obj: DumpObj, name: string): unknown {
  const p = obj.properties.find((x) => x.name === name)
  return p ? dumpVal(p.value) : undefined
}

function xyz(v: unknown): number[] {
  if (Array.isArray(v) && v.length >= 3) return [Number(v[0]), Number(v[1]), Number(v[2])]
  return [0, 0, 0]
}

function flatten(arr: unknown[] | undefined, comps: number): number[] {
  const out: number[] = []
  if (!arr) return out
  for (const item of arr) {
    if (Array.isArray(item)) {
      for (let i = 0; i < comps; i++) out.push(Number(item[i] ?? 0))
    } else {
      out.push(Number(item))
    }
  }
  return out
}

function layer(el: Record<string, unknown> | undefined, comps?: number) {
  if (!el) return null
  const directRaw = el.directArray as unknown[] | undefined
  return {
    name: String(el.name ?? ''),
    mappingMode: Number(el.mappingMode ?? 0),
    referenceMode: Number(el.referenceMode ?? 0),
    direct: comps ? flatten(directRaw, comps) : (directRaw ?? []).map((x) => Number(x)),
    index: ((el.indexArray as number[]) ?? []).map(Number),
  }
}

function matLayer(el: Record<string, unknown> | undefined) {
  if (!el) return null
  return {
    name: String(el.name ?? ''),
    mappingMode: Number(el.mappingMode ?? 0),
    referenceMode: Number(el.referenceMode ?? 0),
    index: ((el.indexArray as number[]) ?? []).map(Number),
  }
}

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

const dumpPath = resolve(process.argv[2] ?? 'tools/fbx-dump/20269546453281.sdk.json')
const outPath = resolve(process.argv[3] ?? 'tests/fixtures/20269546453281.sdk-gold.json')

const dump = JSON.parse(readFileSync(dumpPath, 'utf8')) as {
  sdkVersion?: string
  file?: unknown
  objects: DumpObj[]
  connections: DumpConn[]
}

const byId = new Map(dump.objects.map((o) => [o.uniqueId, o]))
const nodes = dump.objects.filter((o) => o.classId === 'FbxNode')
const root = nodes.find((o) => o.name === 'RootNode')
if (!root) throw new Error('RootNode missing')

const nodePath = new Map<number, string>()

function assignPaths(node: DumpObj, parentPath: string | null): void {
  const typed = node.typed as { childIds?: number[] }
  const children = (typed.childIds ?? []).map((id) => byId.get(id)!).filter(Boolean)
  const counts = new Map<string, number>()
  for (const c of children) counts.set(c.name, (counts.get(c.name) ?? 0) + 1)
  const seen = new Map<string, number>()
  const path = parentPath === null ? node.name : parentPath
  nodePath.set(node.uniqueId, path)
  for (const c of children) {
    const n = seen.get(c.name) ?? 0
    seen.set(c.name, n + 1)
    const childPath =
      (counts.get(c.name) ?? 1) > 1 ? `${path}/${c.name}#${n}` : `${path}/${c.name}`
    assignPaths(c, childPath)
  }
}

assignPaths(root, null)

const goldNodes = nodes.map((n) => {
  const typed = n.typed as {
    childIds?: number[]
    attributeIds?: number[]
    materialIds?: number[]
    rotationOrder?: number
    inheritType?: number
    preRotation?: number[]
    postRotation?: number[]
    rotationPivot?: number[]
    scalingPivot?: number[]
    rotationOffset?: number[]
    scalingOffset?: number[]
    geometricTranslation?: number[]
    geometricRotation?: number[]
    geometricScaling?: number[]
  }
  const children = (typed.childIds ?? []).map((id) => nodePath.get(id)!)
  const attrs = (typed.attributeIds ?? []).map((id) => byId.get(id)).filter(Boolean) as DumpObj[]
  const skel = attrs.find((a) => a.classId === 'FbxSkeleton')
  const nul = attrs.find((a) => a.classId === 'FbxNull')
  const mesh = attrs.find((a) => a.classId === 'FbxMesh')
  let attr: Record<string, unknown> | undefined
  if (skel) attr = { classId: 'FbxSkeleton', skeletonType: skel.typed?.skeletonType }
  else if (nul) attr = { classId: 'FbxNull' }
  else if (mesh) {
    attr = {
      classId: 'FbxMesh',
      controlPointCount: ((mesh.typed?.controlPoints as number[]) ?? []).length / 3,
    }
  }
  const udp = prop(n, 'UDP3DSMAX')
  return {
    path: nodePath.get(n.uniqueId),
    name: n.name,
    t: xyz(prop(n, 'Lcl Translation')),
    r: xyz(prop(n, 'Lcl Rotation')),
    s: xyz(prop(n, 'Lcl Scaling')),
    preRotation: xyz(typed.preRotation),
    postRotation: xyz(typed.postRotation),
    rotationPivot: xyz(typed.rotationPivot),
    scalingPivot: xyz(typed.scalingPivot),
    rotationOffset: xyz(typed.rotationOffset),
    scalingOffset: xyz(typed.scalingOffset),
    geometricTranslation: xyz(typed.geometricTranslation),
    geometricRotation: xyz(typed.geometricRotation),
    geometricScaling: xyz(typed.geometricScaling ?? [1, 1, 1]),
    rotationOrder: typed.rotationOrder ?? 0,
    inheritType: typed.inheritType ?? 0,
    visibility: Number(prop(n, 'Visibility') ?? 1),
    show: Boolean(prop(n, 'Show') ?? true),
    children,
    materials: (typed.materialIds ?? []).map((id) => byId.get(id)?.name ?? ''),
    attr,
    udp3dsmax: typeof udp === 'string' ? udp : undefined,
  }
})

const goldMeshes = dump.objects
  .filter((o) => o.classId === 'FbxMesh')
  .map((m) => {
    const t = m.typed as {
      controlPoints: number[]
      polygonVertexIndex: number[]
      polygonSizes: number[]
      polygonCount: number
      normals: Record<string, unknown>[]
      tangents: Record<string, unknown>[]
      binormals: Record<string, unknown>[]
      uvs: Record<string, unknown>[]
      vertexColors: Record<string, unknown>[]
      materials: Record<string, unknown>[]
    }
    return {
      controlPointCount: t.controlPoints.length / 3,
      verts: t.controlPoints,
      polygonVertexIndex: t.polygonVertexIndex,
      polygonSizes: t.polygonSizes,
      polygonCount: t.polygonCount,
      normals: (t.normals ?? []).map((el) => layer(el, 3)),
      tangents: (t.tangents ?? []).map((el) => layer(el, 3)),
      binormals: (t.binormals ?? []).map((el) => layer(el, 3)),
      uvs: (t.uvs ?? []).map((el) => layer(el, 2)),
      vertexColors: (t.vertexColors ?? []).map((el) => layer(el, 4)),
      materials: (t.materials ?? []).map((el) => matLayer(el)),
    }
  })

const goldSkins = dump.objects
  .filter((o) => o.classId === 'FbxSkin')
  .map((s) => {
    const t = s.typed as { skinningType: number; clusterIds: number[] }
    const mesh = dump.objects.find(
      (o) => o.classId === 'FbxMesh' && ((o as DumpObj).uniqueId) &&
        dump.connections.some((c) => c.kind === 'OO' && c.src === s.uniqueId && c.dst === o.uniqueId),
    )
    const meshCp = ((mesh?.typed?.controlPoints as number[]) ?? []).length / 3
    return {
      meshCp,
      skinningType: t.skinningType,
      clusters: (t.clusterIds ?? []).map((id) => {
        const c = byId.get(id)!
        const ct = c.typed as {
          linkMode: number
          linkId: number
          indexes: number[]
          weights: number[]
          transformLink: number[]
        }
        return {
          bonePath: nodePath.get(ct.linkId) ?? '',
          linkMode: ct.linkMode,
          indexes: ct.indexes,
          weights: ct.weights,
          transformLink: ct.transformLink,
        }
      }),
    }
  })

const MAT_KEYS = [
  'ShadingModel',
  'Emissive',
  'EmissiveColor',
  'EmissiveFactor',
  'Ambient',
  'AmbientColor',
  'AmbientFactor',
  'Diffuse',
  'DiffuseColor',
  'DiffuseFactor',
  'Specular',
  'SpecularColor',
  'SpecularFactor',
  'Shininess',
  'ShininessExponent',
  'Opacity',
  'TransparencyFactor',
  'BumpFactor',
  'ReflectionFactor',
] as const

const goldMaterials = dump.objects
  .filter((o) => o.classId === 'FbxSurfacePhong' || o.classId === 'FbxSurfaceLambert')
  .map((m) => {
    const props: Record<string, unknown> = {}
    for (const k of MAT_KEYS) {
      const v = prop(m, k)
      if (v !== undefined) props[k] = v
    }
    return { name: m.name, classId: m.classId, props }
  })

const goldTextures = dump.objects
  .filter((o) => o.classId === 'FbxFileTexture')
  .map((t) => {
    const typed = t.typed as {
      fileName: string
      relativeFileName: string
      wrapU: number
      wrapV: number
      swapUV: boolean
      alphaSource: number
    }
    return {
      file: basename(typed.fileName ?? ''),
      fileName: typed.fileName,
      relativeFileName: typed.relativeFileName,
      wrapU: typed.wrapU,
      wrapV: typed.wrapV,
      swapUV: typed.swapUV,
      alphaSource: typed.alphaSource,
      uvSet: String(prop(t, 'UVSet') ?? ''),
    }
  })

const goldVideos = dump.objects
  .filter((o) => o.classId === 'FbxVideo')
  .map((v) => {
    const typed = v.typed as { fileName: string; relativeFileName: string }
    return {
      file: basename(typed.fileName ?? ''),
      fileName: typed.fileName,
      relativeFileName: typed.relativeFileName,
    }
  })

const goldLayers = dump.objects
  .filter((o) => o.classId === 'FbxDisplayLayer')
  .map((l) => ({
    name: l.name,
    color: xyz(prop(l, 'Color')),
    show: Boolean(prop(l, 'Show') ?? true),
    freeze: Boolean(prop(l, 'Freeze') ?? false),
    members: ((l.typed?.memberIds as number[]) ?? []).map((id) => nodePath.get(id) ?? byId.get(id)?.name ?? ''),
  }))

const gs = dump.objects.find((o) => o.classId === 'FbxGlobalSettings')!
const skipClass = new Set(['FbxScene', 'FbxAnimEvalClassic'])
const op = dump.connections.filter((c) => c.kind === 'OP')

const gold = {
  skip: ['localTransform', 'cluster.GetTransformMatrix', 'typed.axisSystem', 'FbxAnimEvalClassic', 'uniqueId'],
  sdkVersion: dump.sdkVersion,
  file: dump.file,
  globalSettings: {
    upAxis: Number(prop(gs, 'UpAxis')),
    upAxisSign: Number(prop(gs, 'UpAxisSign')),
    frontAxis: Number(prop(gs, 'FrontAxis')),
    frontAxisSign: Number(prop(gs, 'FrontAxisSign')),
    coordAxis: Number(prop(gs, 'CoordAxis')),
    coordAxisSign: Number(prop(gs, 'CoordAxisSign')),
    originalUpAxis: Number(prop(gs, 'OriginalUpAxis')),
    unitScale: Number(prop(gs, 'UnitScaleFactor')),
    timeMode: Number(prop(gs, 'TimeMode')),
    timeProtocol: Number(prop(gs, 'TimeProtocol')),
    customFrameRate: Number(prop(gs, 'CustomFrameRate')),
    ambient: xyz(prop(gs, 'AmbientColor')),
    defaultCamera: String(prop(gs, 'DefaultCamera') ?? ''),
  },
  classCounts: dump.objects.reduce<Record<string, number>>((acc, o) => {
    acc[o.classId] = (acc[o.classId] ?? 0) + 1
    return acc
  }, {}),
  rootChildren: goldNodes.find((n) => n.path === 'RootNode')?.children ?? [],
  nodes: goldNodes,
  meshes: goldMeshes,
  skins: goldSkins,
  materials: goldMaterials,
  textures: goldTextures,
  videos: goldVideos,
  displayLayers: goldLayers,
  connections: {
    op: op.map((c) => ({
      srcFile: basename(String((byId.get(c.src)?.typed as { fileName?: string } | undefined)?.fileName ?? '')),
      dstMaterial: byId.get(c.dst)?.name ?? '',
      dstProp: c.dstProp ?? '',
    })),
    ooFiltered: dump.connections.filter((c) => {
      const s = byId.get(c.src)
      const d = byId.get(c.dst)
      return c.kind === 'OO' && s && d && !skipClass.has(s.classId) && !skipClass.has(d.classId)
    }).length,
  },
}

writeFileSync(outPath, JSON.stringify(gold))
console.log('wrote', outPath, 'bytes', Buffer.byteLength(JSON.stringify(gold)))
