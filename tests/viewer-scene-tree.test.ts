import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from '../src/parse'
import { buildScene } from '../src/sdk/build-scene'
import type { FbxNode, FbxNodeAttribute } from '../src/sdk'
import {
  countSubtree,
  displayName,
  isExpandedByDefault,
  nodeKind,
} from '../tools/fbx-viewer/src/scene-tree-model'

function stubAttr(classId: FbxNodeAttribute['classId']): FbxNodeAttribute {
  return { classId } as FbxNodeAttribute
}

function stubNode(name: string, attrs: FbxNodeAttribute[] = [], children: FbxNode[] = []): FbxNode {
  const node = {
    uniqueId: 0,
    name,
    classId: 'FbxNode',
    objectFlags: 0,
    properties: [],
    srcObjects: [],
    dstObjects: [],
    parent: null,
    children,
    nodeAttributes: attrs,
    materials: [],
  } as FbxNode
  for (const child of children) child.parent = node
  return node
}

describe('nodeKind', () => {
  it('maps the first attribute classId', () => {
    expect(nodeKind(stubNode('a', [stubAttr('FbxMesh')]))).toBe('Mesh')
    expect(nodeKind(stubNode('a', [stubAttr('FbxSkeleton')]))).toBe('Bone')
    expect(nodeKind(stubNode('a', [stubAttr('FbxNull')]))).toBe('Null')
    expect(nodeKind(stubNode('a', [stubAttr('FbxCamera')]))).toBe('Camera')
    expect(nodeKind(stubNode('a', [stubAttr('FbxLight')]))).toBe('Light')
  })

  it('falls back to Node when there is no attribute', () => {
    expect(nodeKind(stubNode('empty'))).toBe('Node')
  })

  it('falls back to Node for unmapped attributes', () => {
    expect(nodeKind(stubNode('nurbs', [stubAttr('FbxNurbs')]))).toBe('Node')
  })
})

describe('displayName', () => {
  it('uses the node name, or (unnamed) when blank', () => {
    expect(displayName(stubNode('Hip'))).toBe('Hip')
    expect(displayName(stubNode(''))).toBe('(unnamed)')
    expect(displayName(stubNode('  '))).toBe('(unnamed)')
  })
})

describe('isExpandedByDefault', () => {
  it('expands RootNode and its direct children only', () => {
    expect(isExpandedByDefault(0)).toBe(true)
    expect(isExpandedByDefault(1)).toBe(true)
    expect(isExpandedByDefault(2)).toBe(false)
  })
})

describe('countSubtree', () => {
  it('counts the node and all descendants', () => {
    const leaf = stubNode('leaf')
    const mid = stubNode('mid', [], [leaf])
    const root = stubNode('RootNode', [], [mid, stubNode('other')])
    expect(countSubtree(leaf)).toBe(1)
    expect(countSubtree(root)).toBe(4)
  })
})

describe('triangle fixture', () => {
  it('labels RootNode and the mesh child', () => {
    const scene = buildScene(parse(readFileSync('tests/fixtures/ascii-7400-triangle.fbx')))
    expect(nodeKind(scene.rootNode)).toBe('Node')
    expect(displayName(scene.rootNode)).toBe('RootNode')
    expect(countSubtree(scene.rootNode)).toBe(2)
    const mesh = scene.rootNode.children[0]
    expect(mesh).toBeDefined()
    expect(nodeKind(mesh!)).toBe('Mesh')
    expect(displayName(mesh!)).toBe('Triangle')
  })
})
