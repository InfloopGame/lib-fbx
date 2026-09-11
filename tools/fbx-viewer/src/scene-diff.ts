import type { SceneSnapshot, SnapshotNode } from './scene-snapshot'

export type SceneDiff = {
  path: string
  field: string
  a: unknown
  b: unknown
}

const WORLD_EPS = 1e-3
const BOUNDS_EPS = 1e-2

function near(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps
}

function worldClose(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!near(a[i] ?? 0, b[i] ?? 0, WORLD_EPS)) return false
  }
  return true
}

function boundsClose(a: SnapshotNode['bounds'], b: SnapshotNode['bounds']): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  for (let i = 0; i < 6; i++) {
    if (!near(a[i] ?? 0, b[i] ?? 0, BOUNDS_EPS)) return false
  }
  return true
}

function colorClose(a: SnapshotNode['materialColor'], b: SnapshotNode['materialColor']): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return near(a[0], b[0], 1e-3) && near(a[1], b[1], 1e-3) && near(a[2], b[2], 1e-3)
}

/** 按 path 对齐两份快照，报告字段差异。 */
export function diffSnapshots(left: SceneSnapshot, right: SceneSnapshot): SceneDiff[] {
  const diffs: SceneDiff[] = []
  const aMap = new Map(left.nodes.map((n) => [n.path, n]))
  const bMap = new Map(right.nodes.map((n) => [n.path, n]))
  const paths = new Set([...aMap.keys(), ...bMap.keys()])

  for (const path of [...paths].sort()) {
    const a = aMap.get(path)
    const b = bMap.get(path)
    if (!a) {
      diffs.push({ path, field: 'missing', a: null, b: 'present' })
      continue
    }
    if (!b) {
      diffs.push({ path, field: 'missing', a: 'present', b: null })
      continue
    }
    if (a.kind !== b.kind) diffs.push({ path, field: 'kind', a: a.kind, b: b.kind })
    if (!worldClose(a.world, b.world)) diffs.push({ path, field: 'world', a: a.world, b: b.world })
    if (a.vertexCount !== b.vertexCount) {
      diffs.push({ path, field: 'vertexCount', a: a.vertexCount, b: b.vertexCount })
    }
    if (!boundsClose(a.bounds, b.bounds)) diffs.push({ path, field: 'bounds', a: a.bounds, b: b.bounds })
    if (a.bones !== b.bones) diffs.push({ path, field: 'bones', a: a.bones, b: b.bones })
    if (a.clusters !== b.clusters) diffs.push({ path, field: 'clusters', a: a.clusters, b: b.clusters })
    if (!colorClose(a.materialColor, b.materialColor)) {
      diffs.push({ path, field: 'materialColor', a: a.materialColor, b: b.materialColor })
    }
  }
  return diffs
}

export function formatDiffs(diffs: SceneDiff[]): string {
  if (diffs.length === 0) return 'sdk ≈ parse  无差异'
  return diffs
    .slice(0, 40)
    .map((d) => `${d.path}  ${d.field}`)
    .join('\n')
}
