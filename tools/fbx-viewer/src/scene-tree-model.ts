import type { FbxNode } from '../../../src/sdk'

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

export function isExpandedByDefault(depth: number): boolean {
  return depth < 2
}

export function countSubtree(node: FbxNode): number {
  let n = 1
  for (const child of node.children) n += countSubtree(child)
  return n
}
