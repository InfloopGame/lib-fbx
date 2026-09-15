/**
 * 一次性读取检查：parse + buildScene，打印场景摘要。
 * 用法: pnpm exec tsx scripts/inspect-fbx.ts <file.fbx>
 */
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { parse } from '../src/parse'
import { buildScene } from '../src/sdk/build-scene'
import type { FbxNode } from '../src/sdk/geometry'
import { isFbxClass, isFbxMesh, isFbxSkin, isFbxCluster } from '../src/sdk/guards'

const filePath = resolve(process.argv[2] ?? '')
if (!filePath) {
  console.error('用法: pnpm exec tsx scripts/inspect-fbx.ts <file.fbx>')
  process.exit(1)
}

function countPolygons(indexes: Float64Array): number {
  let n = 0
  for (let i = 0; i < indexes.length; i++) {
    if ((indexes[i] ?? 0) < 0) n++
  }
  return n
}

function walkNodes(node: FbxNode, depth: number, lines: string[], limit = 80): void {
  if (lines.length >= limit) return
  const attrs = node.nodeAttributes.map((a) => a.classId.replace(/^Fbx/, '')).join(',')
  const t = node.lclTranslation?.value
  const tStr = t ? ` t=(${t.map((v) => v.toFixed(2)).join(',')})` : ''
  lines.push(
    `${'  '.repeat(depth)}${node.name || '(unnamed)'} [${attrs || 'Node'}] mats=${node.materials.length}${tStr}`,
  )
  for (const child of node.children) walkNodes(child, depth + 1, lines, limit)
}

const info = await stat(filePath)
const buffer = await readFile(filePath)
console.log(`文件: ${filePath}`)
console.log(`大小: ${(info.size / (1024 * 1024)).toFixed(2)} MB`)

const t0 = performance.now()
const doc = parse(buffer)
const parseMs = performance.now() - t0
console.log(`\nparse()  ${parseMs.toFixed(1)} ms`)
console.log(`格式: ${doc.format}  版本: ${doc.version}`)

const treeKeys = Object.keys(doc.tree)
console.log(`tree 顶层: ${treeKeys.join(', ')}`)

const objects = doc.tree.Objects ?? {}
console.log('\nObjects 分类结构:')
for (const [kind, value] of Object.entries(objects)) {
  if (!value || typeof value !== 'object') {
    console.log(`  ${kind}: ${typeof value}`)
    continue
  }
  if (Array.isArray(value)) {
    console.log(`  ${kind}: array[${value.length}]`)
    continue
  }
  const rec = value as Record<string, unknown>
  const keys = Object.keys(rec)
  const numericKeys = keys.filter((k) => /^\d+$/.test(k))
  const sample = keys.slice(0, 12)
  console.log(
    `  ${kind}: keys=${keys.length} numeric=${numericKeys.length} id=${String(rec.id)} name=${String(rec.name)} attrName=${String(rec.attrName)} attrType=${String(rec.attrType)}`,
  )
  console.log(`    sample keys: ${sample.join(', ')}`)
}

const connections = doc.tree.Connections
const connList =
  connections && typeof connections === 'object' && 'connections' in connections
    ? ((connections as { connections?: unknown[] }).connections ?? [])
    : []
console.log(`\nConnections: ${connList.length}`)
let nameConn = 0
let idConn = 0
const names = new Set<string>()
for (const row of connList) {
  if (!Array.isArray(row) || row.length < 2) continue
  const a = row[0]
  const b = row[1]
  if (typeof a === 'string' || typeof b === 'string') nameConn++
  if (typeof a === 'number' && typeof b === 'number') idConn++
  if (typeof a === 'string') names.add(a)
  if (typeof b === 'string') names.add(b)
}
console.log(`  数字ID连接: ${idConn}  名字连接: ${nameConn}  涉及名字: ${names.size}`)
for (const row of connList.slice(0, 8)) {
  console.log(`  ${JSON.stringify(row)}`)
}
if (connList.length > 8) console.log(`  ... +${connList.length - 8}`)

const geoBucket = objects.Geometry as Record<string, Record<string, unknown>> | undefined
if (geoBucket) {
  console.log('\nGeometry 节点:')
  for (const [id, geo] of Object.entries(geoBucket)) {
    const verts = (geo.Vertices as { a?: Float64Array } | undefined)?.a
    const idx = (geo.PolygonVertexIndex as { a?: Float64Array } | undefined)?.a
    const vNode = geo.Vertices as Record<string, unknown> | undefined
    const vPl = vNode?.propertyList
    console.log(
      `  ${id} attrName=${String(geo.attrName)} keys=${Object.keys(geo).join(',')} verts=${verts?.length ?? 'no.a'} idx=${idx?.length ?? 'no.a'} Vertices.typeof=${typeof geo.Vertices} Vertices.pl=${Array.isArray(vPl) ? `len=${vPl.length} t0=${typeof (vPl as unknown[])[0]}` : String(vPl)}`,
    )
  }
}

const model = objects.Model as Record<string, unknown> | undefined
if (model) {
  const pl = model.propertyList as unknown[] | undefined
  console.log('\n幸存 Model:')
  console.log(`  propertyList=${JSON.stringify(pl)}`)
  console.log(`  attrName=${String(model.attrName)} Version=${String(model.Version)}`)
  console.log(`  有 Vertices? ${'Vertices' in model}  有 undefined 键? ${'undefined' in model}`)
  const extra = model.undefined as Record<string, unknown> | undefined
  if (extra) console.log(`  Model.undefined keys=${Object.keys(extra).join(',')} attrName=${String(extra.attrName)}`)
}

const defs = doc.tree.Definitions as Record<string, unknown> | undefined
if (defs) {
  console.log('\nDefinitions keys:', Object.keys(defs).slice(0, 20).join(', '))
  const objectType = defs.ObjectType as Record<string, unknown> | undefined
  if (objectType) {
    console.log('  ObjectType keys:', Object.keys(objectType).join(', '))
    for (const [k, v] of Object.entries(objectType)) {
      const rec = v as Record<string, unknown>
      console.log(`    ${k}: Count=${String(rec.Count)} keys=${Object.keys(rec).join(',')}`)
    }
  }
}

const t1 = performance.now()
const scene = buildScene(doc)
const sdkMs = performance.now() - t1
console.log(`\nbuildScene()  ${sdkMs.toFixed(1)} ms`)

const classCounts = new Map<string, number>()
for (const obj of scene.members) {
  classCounts.set(obj.classId, (classCounts.get(obj.classId) ?? 0) + 1)
}
console.log('\nSDK 对象计数:')
for (const [id, n] of [...classCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${id}: ${n}`)
}

const gs = scene.globalSettings
console.log('\nGlobalSettings:')
console.log(`  up=${gs.axisSystem.upVector} sign=${gs.axisSystem.upSign} coord=${gs.axisSystem.coordSystem}`)
console.log(`  unit scale=${gs.systemUnit.scaleFactor}`)
console.log(`  materials=${scene.materials.length} textures=${scene.textures.length} videos=${scene.videos.length}`)
console.log(`  cameras=${scene.cameras.length} lights=${scene.lights.length}`)
console.log(`  poses=${scene.poses.length} animStacks=${scene.animStacks.length}`)
console.log(`  connections=${scene.connections.length}`)

const meshes = scene.members.filter(isFbxMesh)
console.log(`\nMesh (${meshes.length}):`)
for (const mesh of meshes) {
  const verts = mesh.controlPoints.length / 3
  const polys = countPolygons(mesh.polygonIndexes)
  const skins = mesh.deformers.filter(isFbxSkin)
  const clusters = skins.reduce((s, skin) => s + skin.clusters.length, 0)
  console.log(
    `  ${mesh.name || '(unnamed)'} verts=${verts} polys=${polys} idx=${mesh.polygonIndexes.length} skins=${skins.length} clusters=${clusters}`,
  )
}

const skeletons = scene.members.filter((o) => isFbxClass(o, 'FbxSkeleton'))
const clusters = scene.members.filter(isFbxCluster)
console.log(`\nSkeleton: ${skeletons.length}  Cluster: ${clusters.length}`)
if (skeletons.length > 0) {
  console.log('  bones:')
  for (const bone of skeletons.slice(0, 20)) {
    console.log(`    ${bone.name}`)
  }
  if (skeletons.length > 20) console.log(`    ... +${skeletons.length - 20}`)
}

console.log('\n材质:')
for (const mat of scene.materials) {
  console.log(`  ${mat.name} (${mat.classId})`)
}

console.log('\n贴图:')
for (const tex of scene.textures) {
  const file = 'fileName' in tex ? (tex as { fileName?: string }).fileName : undefined
  console.log(`  ${tex.name}${file ? ` ← ${file}` : ''}`)
}

if (scene.animStacks.length > 0) {
  console.log('\n动画栈:')
  for (const stack of scene.animStacks) {
    console.log(`  ${stack.name} layers=${stack.members.length}`)
  }
}

const treeLines: string[] = []
walkNodes(scene.rootNode, 0, treeLines, 100)
console.log(`\n节点树 (最多 100 行):`)
console.log(treeLines.join('\n'))

console.log(`\n合计: parse ${parseMs.toFixed(1)} ms + sdk ${sdkMs.toFixed(1)} ms = ${(parseMs + sdkMs).toFixed(1)} ms`)
