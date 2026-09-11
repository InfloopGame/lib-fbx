import { Box3, Vector3, type Object3D } from 'three'

export type SnapshotKind = 'Mesh' | 'Bone' | 'Group'

export type SnapshotNode = {
  path: string
  kind: SnapshotKind
  world: number[]
  vertexCount: number
  bounds: [number, number, number, number, number, number] | null
  bones: number
  clusters: number
  materialColor: [number, number, number] | null
}

export type SceneSnapshot = {
  nodes: SnapshotNode[]
}

const EPS = 1e-4

function isMeshLike(obj: Object3D): boolean {
  return obj.type === 'Mesh' || obj.type === 'SkinnedMesh'
}

function kindOf(obj: Object3D, vertexCount: number): SnapshotKind {
  if (obj.type === 'Bone') return 'Bone'
  if (isMeshLike(obj) || vertexCount > 0) return 'Mesh'
  return 'Group'
}

function worldElements(obj: Object3D): number[] {
  const el = obj.matrixWorld.elements as ArrayLike<number>
  const out: number[] = []
  for (let i = 0; i < el.length; i++) {
    const n = Number(el[i] ?? 0)
    out.push(Math.abs(n) < EPS ? 0 : n)
  }
  return out
}

function meshStats(obj: Object3D): {
  vertexCount: number
  bounds: SnapshotNode['bounds']
  bones: number
  clusters: number
  materialColor: SnapshotNode['materialColor']
} {
  const mesh = obj as Object3D & {
    geometry?: { getAttribute: (name: string) => { count: number; array: ArrayLike<number> } | undefined }
    skeleton?: { bones: unknown[]; boneInverses: unknown[] }
    material?: { color?: { r: number; g: number; b: number } } | Array<{ color?: { r: number; g: number; b: number } }>
  }
  const pos = mesh.geometry?.getAttribute('position')
  const vertexCount = pos?.count ?? 0
  let bounds: SnapshotNode['bounds'] = null
  if (vertexCount > 0) {
    const box = new Box3().setFromObject(obj)
    if (!box.isEmpty()) {
      const min = box.min
      const max = box.max
      bounds = [min.x, min.y, min.z, max.x, max.y, max.z]
    }
  }
  const bones = mesh.skeleton?.bones.length ?? 0
  const clusters = mesh.skeleton?.boneInverses.length ?? 0
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  const c = mat?.color
  const materialColor = c ? ([c.r, c.g, c.b] as [number, number, number]) : null
  return { vertexCount, bounds, bones, clusters, materialColor }
}

function displayName(obj: Object3D): string {
  const name = obj.name.trim()
  return name || obj.type
}

function collectGeometry(obj: Object3D): Object3D[] {
  if (isMeshLike(obj)) return [obj]
  const meshes: Object3D[] = []
  for (const child of obj.children) {
    if (isMeshLike(child)) meshes.push(child)
  }
  return meshes
}

function emit(obj: Object3D, path: string, nodes: SnapshotNode[], foldChildren: boolean): void {
  const geos = foldChildren ? collectGeometry(obj) : isMeshLike(obj) ? [obj] : []
  const primary = geos[0] ?? obj
  const stats = meshStats(primary)
  if (geos.length > 1) {
    let vertexCount = 0
    const box = new Box3()
    for (const g of geos) {
      vertexCount += meshStats(g).vertexCount
      box.union(new Box3().setFromObject(g))
    }
    stats.vertexCount = vertexCount
    if (!box.isEmpty()) {
      stats.bounds = [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]
    }
  }
  nodes.push({
    path,
    kind: kindOf(obj, stats.vertexCount),
    world: worldElements(obj),
    ...stats,
  })
}

function walk(obj: Object3D, parentPath: string, nodes: SnapshotNode[], foldChildren: boolean): void {
  const name = displayName(obj)
  const path = parentPath ? `${parentPath}/${name}` : name
  emit(obj, path, nodes, foldChildren)
  for (const child of obj.children) {
    if (foldChildren && isMeshLike(child) && !isMeshLike(obj) && obj.type !== 'Bone') continue
    walk(child, path, nodes, true)
  }
}

/** 从 Three.js 对象图抽出可比快照。非根 Group + Mesh 子节点会折叠成一个 Mesh。 */
export function snapshotScene(root: Object3D): SceneSnapshot {
  root.updateMatrixWorld(true)
  const nodes: SnapshotNode[] = []
  walk(root, '', nodes, false)
  return { nodes }
}

export function roundWorld(world: number[], digits = 4): number[] {
  const f = 10 ** digits
  return world.map((n) => Math.round(n * f) / f)
}

export function boundsCenter(bounds: SnapshotNode['bounds']): Vector3 | null {
  if (!bounds) return null
  return new Vector3(
    (bounds[0] + bounds[3]) / 2,
    (bounds[1] + bounds[4]) / 2,
    (bounds[2] + bounds[5]) / 2,
  )
}
