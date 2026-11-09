import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from '../src/parse'
import { buildScene } from '../src/sdk/build-scene'
import type { FbxNode, FbxNodeAttribute } from '../src/sdk'
import { FbxPropertyFlags, type FbxProperty } from '../src/sdk'
import {
  countSubtree,
  displayName,
  fbxTypeLabel,
  isExpandedByDefault,
  nodeKind,
  parseUdpEntries,
  userProperties,
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

describe('fbxTypeLabel', () => {
  it('uses attribute class ids, or FbxNode when there is none', () => {
    expect(fbxTypeLabel(stubNode('a', [stubAttr('FbxMesh')]))).toBe('FbxMesh')
    expect(fbxTypeLabel(stubNode('a', [stubAttr('FbxSkeleton'), stubAttr('FbxNull')]))).toBe('FbxSkeleton, FbxNull')
    expect(fbxTypeLabel(stubNode('empty'))).toBe('FbxNode')
  })
})

describe('userProperties', () => {
  it('returns only properties flagged as user-defined', () => {
    const note = prop('Note', 'hi', FbxPropertyFlags.eUserDefined)
    const lcl = prop('Lcl Translation', [0, 0, 0], FbxPropertyFlags.eAnimatable)
    const node = stubNode('a')
    node.properties = [lcl, note]
    expect(userProperties(node)).toEqual([note])
  })
})

describe('parseUdpEntries', () => {
  it('splits a 3ds Max UDP string into name and value', () => {
    expect(parseUdpEntries('MapChannel:1 = UVChannel_1&cr;&lf;')).toEqual([
      { name: 'MapChannel:1', value: 'UVChannel_1' },
    ])
    expect(parseUdpEntries('a = 1&cr;&lf;b = two&quot;x&quot;')).toEqual([
      { name: 'a', value: '1' },
      { name: 'b', value: 'two"x"' },
    ])
  })

  it('returns null when a line is not name = value', () => {
    expect(parseUdpEntries('just a note')).toBeNull()
  })
})

function prop(name: string, value: FbxProperty['value'], flags: number): FbxProperty {
  return { name, dataType: 18, flags, value }
}

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
