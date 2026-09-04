import { describe, expect, it } from 'vitest'
import { EFbxType, FBXSDK_TC_SECOND, FbxDeformerType, FbxNodeAttributeType, FbxSkinningType, FbxSubDeformerType } from '../../src/sdk'
import type { FbxAnimCurve, FbxAnimLayer, FbxAnimStack } from '../../src/sdk'
import type { FbxCluster, FbxMesh, FbxNode, FbxSkin } from '../../src/sdk'
import type { FbxScene } from '../../src/sdk'
import type { FbxSurfacePhong } from '../../src/sdk'
import { isFbxAnimCurve, isFbxMesh, isFbxNode, isFbxScene, isFbxSkin, isFbxSurfacePhong } from '../../src/sdk'

function objectBase<C extends string>(classId: C, uniqueId: number, name: string) {
  return {
    uniqueId,
    name,
    classId,
    objectFlags: 0,
    properties: [],
    srcObjects: [] as never[],
    dstObjects: [] as never[],
  }
}

describe('sdk scene fixture', () => {
  it('最小 Scene：Root → Mesh + Phong + Skin + AnimCurve 引用完整', () => {
    const mesh: FbxMesh = {
      ...objectBase('FbxMesh', 2, 'Geo'),
      attributeType: FbxNodeAttributeType.eMesh,
      color: undefined,
      nodes: [],
      layers: [],
      controlPoints: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      deformers: [],
      polygonIndexes: new Float64Array([0, 1, -3]),
    }

    const cluster: FbxCluster = {
      ...objectBase('FbxCluster', 5, 'Cluster'),
      subDeformerType: FbxSubDeformerType.eCluster,
      linkMode: 0,
      indexes: new Float64Array([0, 1, 2]),
      weights: new Float64Array([1, 1, 1]),
    }

    const skin: FbxSkin = {
      ...objectBase('FbxSkin', 4, 'Skin'),
      deformerType: FbxDeformerType.eSkin,
      skinningType: FbxSkinningType.eLinear,
      clusters: [cluster],
    }
    mesh.deformers.push(skin)

    const phong: FbxSurfacePhong = {
      ...objectBase('FbxSurfacePhong', 3, 'Mat'),
      diffuse: {
        name: 'Diffuse',
        dataType: EFbxType.eFbxDouble3,
        flags: 0,
        value: [0.8, 0.8, 0.8],
      },
    }

    const meshNode: FbxNode = {
      ...objectBase('FbxNode', 1, 'MeshNode'),
      parent: null,
      children: [],
      nodeAttributes: [mesh],
      materials: [phong],
    }
    mesh.nodes.push(meshNode)
    cluster.link = meshNode

    const root: FbxNode = {
      ...objectBase('FbxNode', 0, 'RootNode'),
      parent: null,
      children: [meshNode],
      nodeAttributes: [],
      materials: [],
    }
    meshNode.parent = root

    const curve: FbxAnimCurve = {
      ...objectBase('FbxAnimCurve', 8, 'T.X'),
      keys: [
        { time: { ticks: 0 }, value: 0 },
        { time: { ticks: FBXSDK_TC_SECOND }, value: 10 },
      ],
    }

    const layer: FbxAnimLayer = {
      ...objectBase('FbxAnimLayer', 7, 'BaseLayer'),
      members: [curve],
    }

    const stack: FbxAnimStack = {
      ...objectBase('FbxAnimStack', 6, 'Take 001'),
      members: [layer],
      layers: [layer],
    }

    const scene: FbxScene = {
      ...objectBase('FbxScene', 100, 'Scene'),
      members: [root, meshNode, mesh, phong, skin, cluster, stack, layer, curve],
      roots: [root],
      rootNode: root,
      globalSettings: {
        ...objectBase('FbxGlobalSettings', 101, 'GlobalSettings'),
        axisSystem: {
          upVector: 2,
          upSign: 1,
          frontVector: 2,
          frontSign: 1,
          coordSystem: 0,
        },
        systemUnit: { scaleFactor: 1, multiplier: 1 },
      },
      poses: [],
      animStacks: [stack],
      materials: [phong],
      textures: [],
      videos: [],
      cameras: [],
      lights: [],
      connections: [
        { src: mesh, dst: meshNode, type: 0, fileKind: 'OO' },
        { src: phong, dst: meshNode, type: 0, fileKind: 'OO' },
        { src: skin, dst: mesh, type: 0, fileKind: 'OO' },
        { src: cluster, dst: skin, type: 0, fileKind: 'OO' },
        { src: layer, dst: stack, type: 0, fileKind: 'OO' },
      ],
    }

    expect(isFbxScene(scene)).toBe(true)
    expect(isFbxNode(scene.rootNode)).toBe(true)
    expect(scene.rootNode.children).toHaveLength(1)
    expect(scene.rootNode.children[0]?.parent).toBe(scene.rootNode)

    const child = scene.rootNode.children[0]
    expect(child).toBeDefined()
    expect(isFbxNode(child!)).toBe(true)
    expect(isFbxMesh(child!.nodeAttributes[0]!)).toBe(true)
    expect(isFbxSurfacePhong(child!.materials[0]!)).toBe(true)

    const geo = child!.nodeAttributes[0] as FbxMesh
    expect(geo.controlPoints.length).toBe(9)
    expect(geo.polygonIndexes[2]).toBe(-3)
    expect(isFbxSkin(geo.deformers[0]!)).toBe(true)
    expect((geo.deformers[0] as FbxSkin).clusters[0]?.link).toBe(child)

    expect(scene.animStacks[0]?.layers[0]?.members[0]).toBe(curve)
    expect(isFbxAnimCurve(curve)).toBe(true)
    expect(curve.keys[1]?.time.ticks).toBe(FBXSDK_TC_SECOND)
    expect(scene.connections).toHaveLength(5)
    expect(scene.materials[0]).toBe(phong)
  })
})
