import { describe, expect, it } from 'vitest'
import { parse } from '../../src/parse'
import { EFbxType } from '../../src/sdk/core'
import {
  FbxDeformerType,
  FbxLayerElementMappingMode,
  FbxNodeAttributeType,
  FbxSubDeformerType,
} from '../../src/sdk/geometry'
import type { FbxMesh, FbxSkin } from '../../src/sdk/geometry'
import type { FbxCollection } from '../../src/sdk/core'
import {
  isFbxAnimCurve,
  isFbxAnimStack,
  isFbxCluster,
  isFbxMesh,
  isFbxNode,
  isFbxScene,
  isFbxSkin,
  isFbxSurfacePhong,
} from '../../src/sdk/guards'
import { buildScene } from '../../src/sdk/build-scene'
import type { FbxTreeData } from '../../src/types'
import { loadFixture, loadFixtureText } from '../helpers/load-fixture'

describe('buildScene', () => {
  it('从空 tree 得到带 RootNode 的 Scene', () => {
    const scene = buildScene({})
    expect(isFbxScene(scene)).toBe(true)
    expect(isFbxNode(scene.rootNode)).toBe(true)
    expect(scene.rootNode.name).toBe('RootNode')
    expect(scene.rootNode.uniqueId).toBe(0)
    expect(scene.rootNode.children).toEqual([])
    expect(scene.connections).toEqual([])
  })

  it('接受 FbxParseResult 与 tree 两种输入', () => {
    const doc = parse(loadFixtureText('ascii-7400-triangle.fbx'))
    const fromDoc = buildScene(doc)
    const fromTree = buildScene(doc.tree)
    expect(fromDoc.rootNode.children).toHaveLength(fromTree.rootNode.children.length)
  })

  describe('ascii-7400-triangle', () => {
    it('组装 Mesh 节点、材质、变换、Video 与连接', () => {
      const scene = buildScene(parse(loadFixtureText('ascii-7400-triangle.fbx')))
      expect(scene.rootNode.children).toHaveLength(1)

      const node = scene.rootNode.children[0]
      expect(node).toBeDefined()
      expect(isFbxNode(node!)).toBe(true)
      expect(node!.name).toBe('Triangle')
      expect(node!.parent).toBe(scene.rootNode)
      expect(node!.lclTranslation?.value).toEqual([1, 2, 3])
      expect(node!.lclRotation?.value).toEqual([0, 90, 0])
      expect(node!.lclTranslation?.dataType).toBe(EFbxType.eFbxDouble3)

      expect(isFbxMesh(node!.nodeAttributes[0]!)).toBe(true)
      const mesh = node!.nodeAttributes[0] as FbxMesh
      expect(mesh.attributeType).toBe(FbxNodeAttributeType.eMesh)
      expect(Array.from(mesh.controlPoints)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
      expect(Array.from(mesh.polygonIndexes)).toEqual([0, 1, -3])
      expect(mesh.nodes).toContain(node)

      expect(node!.materials).toHaveLength(1)
      expect(isFbxSurfacePhong(node!.materials[0]!)).toBe(true)
      expect(node!.materials[0]!.name).toBe('Default')

      expect(scene.videos).toHaveLength(1)
      expect(scene.videos[0]?.name).toBe('tex')
      expect(scene.poses).toHaveLength(1)
      expect(scene.poses[0]?.bindPose).toBe(true)
      expect(scene.poses[0]?.poseInfos.some((p) => p.node === node)).toBe(true)

      expect(scene.connections.length).toBeGreaterThanOrEqual(2)
      expect(scene.materials).toHaveLength(1)
    })
  })

  describe('ascii-6100-embedded', () => {
    it('把抽出的 Geometry 与 Skin 挂到 Model', () => {
      const scene = buildScene(parse(loadFixture('ascii-6100-embedded.fbx')))
      const node = scene.rootNode.children.find((n) => n.name === 'Box')
      expect(node).toBeDefined()
      expect(isFbxMesh(node!.nodeAttributes[0]!)).toBe(true)
      const mesh = node!.nodeAttributes[0] as FbxMesh
      expect(Array.from(mesh.controlPoints)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
      expect(isFbxSkin(mesh.deformers[0]!)).toBe(true)
      expect((mesh.deformers[0] as FbxSkin).deformerType).toBe(FbxDeformerType.eSkin)
    })
  })

  describe('ascii-7300-multiple-materials', () => {
    it('多根节点、多材质、动画栈与全局设置', () => {
      const scene = buildScene(parse(loadFixture('ascii-7300-multiple-materials.fbx')))
      expect(scene.rootNode.children.length).toBeGreaterThanOrEqual(4)
      expect(scene.globalSettings.systemUnit.scaleFactor).toBe(2.54)
      expect(scene.globalSettings.axisSystem.upVector).toBe(2)

      const box = scene.rootNode.children.find((n) => n.name === 'Box004')
      expect(box).toBeDefined()
      expect(isFbxMesh(box!.nodeAttributes[0]!)).toBe(true)
      expect(box!.materials.length).toBe(4)

      const mesh = box!.nodeAttributes[0] as FbxMesh
      expect(mesh.layers[0]?.normals?.mappingMode).toBe(FbxLayerElementMappingMode.eByPolygonVertex)
      expect(mesh.layers[0]?.uvs[0]?.name).toBe('UVChannel_1')
      expect(mesh.layers[0]?.materials).toBeDefined()

      expect(scene.animStacks).toHaveLength(1)
      expect(isFbxAnimStack(scene.animStacks[0]!)).toBe(true)
      expect(scene.animStacks[0]!.name).toBe('Take 001')
      expect(scene.animStacks[0]!.layers.length).toBeGreaterThanOrEqual(1)
      const curveNode = scene.animStacks[0]!.layers[0]!.members.find((m) => m.classId === 'FbxAnimCurveNode') as
        | { channels: Array<{ curve?: { classId: string } }> }
        | undefined
      expect(curveNode).toBeDefined()
      expect(curveNode!.channels.some((c) => c.curve && isFbxAnimCurve(c.curve as never))).toBe(true)
    })
  })

  it('binary triangle 与 ascii 结构一致', () => {
    const scene = buildScene(parse(loadFixture('binary-7400-triangle.fbx')))
    const node = scene.rootNode.children[0]
    expect(node?.name).toBe('Triangle')
    expect(node).toBeDefined()
    expect(isFbxMesh(node!.nodeAttributes[0]!)).toBe(true)
    expect(node?.lclTranslation?.value).toEqual([1, 2, 3])
  })

  it('合成 tree 覆盖 Camera/Light/Skeleton/Cluster/NURBS/Constraint/OP', () => {
    const tree = {
      GlobalSettings: {
        UpAxis: { type: 'int', value: 2 },
        UpAxisSign: { type: 'int', value: -1 },
        FrontAxis: { type: 'int', value: 1 },
        CoordAxisSign: { type: 'int', value: -1 },
        TimeMode: { type: 'enum', value: 11 },
        AmbientColor: { type: 'ColorRGB', value: [1, 0, 0] },
        DefaultCamera: { type: 'KString', value: 'Cam' },
      },
      Objects: {
        Model: {
          1: { id: 1, attrName: 'Bone', attrType: 'LimbNode', InheritType: { type: 'enum', value: 1 } },
          2: { id: 2, attrName: 'Mesh', attrType: 'Mesh' },
        },
        Geometry: {
          10: {
            id: 10,
            attrName: 'Mesh',
            attrType: 'Mesh',
            Vertices: { a: new Float64Array([0, 0, 0]) },
            PolygonVertexIndex: { a: new Float64Array([-1]) },
            LayerElementNormal: {
              0: {
                id: 0,
                Name: 'n',
                MappingInformationType: 'ByControlPoint',
                ReferenceInformationType: 'Direct',
                Normals: { a: new Float64Array([0, 1, 0]) },
              },
            },
          },
          11: {
            id: 11,
            attrName: 'Curve',
            attrType: 'NurbsCurve',
            Order: 4,
            Form: 'Open',
            KnotVector: { a: new Float64Array([0, 0, 1, 1]) },
            Points: { a: new Float64Array([0, 0, 0, 1, 0, 0]) },
          },
          12: { id: 12, attrName: 'Shape', attrType: 'Shape', Vertices: { a: new Float64Array([0, 0, 0]) } },
        },
        NodeAttribute: {
          20: {
            id: 20,
            attrName: 'Cam',
            attrType: 'Camera',
            FieldOfView: { type: 'FieldOfView', value: 45 },
            CameraProjectionType: { type: 'enum', value: 0 },
          },
          21: {
            id: 21,
            attrName: 'Lamp',
            attrType: 'Light',
            LightType: { type: 'enum', value: 2 },
            Intensity: { type: 'Number', value: 100 },
            CastShadows: { type: 'bool', value: 1 },
          },
          22: { id: 22, attrName: 'Skel', attrType: 'LimbNode', Size: { type: 'double', value: 1 } },
        },
        Deformer: {
          30: { id: 30, attrName: 'Skin', attrType: 'Skin' },
          31: {
            id: 31,
            attrName: 'Cluster',
            attrType: 'Cluster',
            Indexes: { a: new Float64Array([0]) },
            Weights: { a: new Float64Array([1]) },
            Transform: { a: new Float64Array(16) },
            TransformLink: { a: new Float64Array(16) },
          },
          32: { id: 32, attrName: 'BS', attrType: 'BlendShape' },
          33: { id: 33, attrName: 'Ch', attrType: 'BlendShapeChannel', DeformPercent: 50 },
        },
        Texture: {
          40: { id: 40, attrName: 'Tex', FileName: 'a.png', WrapModeU: { type: 'enum', value: 1 } },
        },
        Video: {
          41: { id: 41, attrName: 'Clip', FileName: 'a.png', Content: new ArrayBuffer(4) },
        },
        Material: {
          50: {
            id: 50,
            attrName: 'Lambert',
            ShadingModel: 'lambert',
            Diffuse: { type: 'Vector3D', value: [1, 0, 0] },
          },
        },
        Constraint: {
          60: { id: 60, attrName: 'Aim', attrType: 'Aim', Weight: { type: 'Number', value: 100 } },
        },
        AnimationStack: { 70: { id: 70, attrName: 'Take' } },
        AnimationLayer: { 71: { id: 71, attrName: 'Layer' } },
        AnimationCurveNode: {
          72: { id: 72, attrName: 'T', 'd|X': { type: 'Number', flag: 'A', value: 0 } },
        },
        AnimationCurve: {
          73: {
            id: 73,
            attrName: 'X',
            KeyTime: { a: new Float64Array([0, 46186158000]) },
            KeyValueFloat: { a: new Float64Array([0, 1]) },
            KeyAttrFlags: { a: new Float64Array([8]) },
          },
        },
        Pose: {
          80: {
            id: 80,
            attrName: 'Bind',
            attrType: 'BindPose',
            PoseNode: { Node: 2, Matrix: { a: new Float64Array(16) } },
          },
        },
        CollectionExclusive: {
          90: { id: 90, attrName: 'Lay', attrType: 'DisplayLayer', Color: { type: 'ColorRGB', value: [1, 0, 0] } },
          91: { id: 91, attrName: 'OtherCol', attrType: 'Collection' },
        },
      },
      Connections: {
        connections: [
          [1, 0],
          [2, 0],
          [10, 2],
          [20, 1],
          [21, 2],
          [22, 1],
          [30, 10],
          [31, 30],
          [1, 31],
          [32, 10],
          [33, 32],
          [12, 33],
          [50, 2],
          [40, 50, 'DiffuseColor'],
          [41, 40],
          [71, 70],
          [72, 71],
          [73, 72, 'd|X'],
          [72, 2, 'Lcl Translation'],
          [60, 2],
          [1, 90],
          [91, 2],
        ],
      },
    }

    const scene = buildScene(tree as unknown as FbxTreeData)
    const bone = scene.rootNode.children.find((n) => n.name === 'Bone')
    const meshNode = scene.rootNode.children.find((n) => n.name === 'Mesh')
    expect(bone?.nodeAttributes.some((a) => a.classId === 'FbxCamera')).toBe(true)
    expect(bone?.nodeAttributes.some((a) => a.classId === 'FbxSkeleton')).toBe(true)
    expect(meshNode?.nodeAttributes.some((a) => a.classId === 'FbxLight')).toBe(true)
    expect(isFbxMesh(meshNode!.nodeAttributes.find((a) => a.classId === 'FbxMesh')!)).toBe(true)

    const mesh = meshNode!.nodeAttributes.find((a) => a.classId === 'FbxMesh') as FbxMesh
    expect(isFbxSkin(mesh.deformers.find((d) => d.classId === 'FbxSkin')!)).toBe(true)
    const skin = mesh.deformers.find((d) => d.classId === 'FbxSkin') as FbxSkin
    expect(isFbxCluster(skin.clusters[0]!)).toBe(true)
    expect(skin.clusters[0]!.subDeformerType).toBe(FbxSubDeformerType.eCluster)
    expect(skin.clusters[0]!.link).toBe(bone)
    expect(mesh.deformers.some((d) => d.classId === 'FbxBlendShape')).toBe(true)

    expect(meshNode!.materials[0]?.classId).toBe('FbxSurfaceLambert')
    expect(scene.textures[0]?.classId).toBe('FbxFileTexture')
    expect(scene.videos[0]?.content).toBeInstanceOf(ArrayBuffer)
    expect(scene.animStacks[0]?.layers[0]?.members.length).toBeGreaterThan(0)
    const curveNode = scene.animStacks[0]!.layers[0]!.members.find((m) => m.classId === 'FbxAnimCurveNode')
    expect(curveNode).toBeDefined()

    expect(scene.globalSettings.axisSystem.upVector).toBe(3)
    expect(scene.globalSettings.axisSystem.upSign).toBe(-1)
    expect(scene.cameras.length).toBeGreaterThanOrEqual(1)
    expect(scene.lights.length).toBeGreaterThanOrEqual(1)

    const lay = scene.members.find((o) => o.name === 'Lay') as FbxCollection | undefined
    expect(lay?.classId).toBe('FbxDisplayLayer')
    expect(lay?.members).toContain(bone)
    const other = scene.members.find((o) => o.name === 'OtherCol') as FbxCollection | undefined
    expect(other?.classId).toBe('FbxCollectionExclusive')
    expect(other?.members).toContain(meshNode)
  })
})
