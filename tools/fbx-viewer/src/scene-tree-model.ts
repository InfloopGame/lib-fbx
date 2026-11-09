import { FbxPropertyFlags, type FbxNode, type FbxProperty } from '../../../src/sdk'

export type NodeKind = 'Mesh' | 'Bone' | 'Null' | 'Camera' | 'Light' | 'Node'

const KIND_BY_CLASS: Partial<Record<string, NodeKind>> = {
  FbxMesh: 'Mesh',
  FbxSkeleton: 'Bone',
  FbxNull: 'Null',
  FbxCamera: 'Camera',
  FbxLight: 'Light',
}

export function nodeKind(node: FbxNode): NodeKind {
  const classId = node.nodeAttributes[0]?.classId
  return (classId && KIND_BY_CLASS[classId]) || 'Node'
}

export function displayName(node: FbxNode): string {
  const name = node.name.trim()
  return name || '(unnamed)'
}

/** 节点属性的 classId。没有属性时就是 FbxNode。 */
export function fbxTypeLabel(node: FbxNode): string {
  const ids = node.nodeAttributes.map((attr) => attr.classId)
  return ids.length > 0 ? ids.join(', ') : 'FbxNode'
}

/** Properties70 标志含 U 的属性。 */
export function userProperties(node: FbxNode): FbxProperty[] {
  return node.properties.filter((prop) => (prop.flags & FbxPropertyFlags.eUserDefined) !== 0)
}

export type UdpEntry = { name: string; value: string }

/** 还原 FBX 文本里的 `&cr;` `&lf;` `&quot;` `&amp;`。 */
export function unescapeFbxText(text: string): string {
  return text
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&tab;', '\t')
    .replaceAll('&cr;', '\r')
    .replaceAll('&lf;', '\n')
    .replaceAll('&amp;', '&')
}

/**
 * 3ds Max 把用户属性收成 `UDP3DSMAX` 字符串，一行一个 `名字 = 值`。
 * 能整段拆开时返回条目；否则返回 null，调用方照原字符串显示。
 */
export function parseUdpEntries(text: string): UdpEntry[] | null {
  const lines = unescapeFbxText(text)
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (lines.length === 0) return []
  const entries: UdpEntry[] = []
  for (const line of lines) {
    const eq = line.indexOf('=')
    if (eq <= 0) return null
    const name = line.slice(0, eq).trim()
    if (!name) return null
    entries.push({ name, value: line.slice(eq + 1).trim() })
  }
  return entries
}

export function isExpandedByDefault(depth: number): boolean {
  return depth < 2
}

export function countSubtree(node: FbxNode): number {
  let n = 1
  for (const child of node.children) n += countSubtree(child)
  return n
}
