import { describe, expect, it } from 'vitest'
import { parse } from '../src/parse'
import { buildScene } from '../src/sdk/build-scene'
import { isFbxClass, isFbxMesh, isFbxSkin } from '../src/sdk/guards'
import { FbxLayerElementMappingMode, type FbxMesh, type FbxSkin } from '../src/sdk/geometry'
import { buildBinaryFbx } from './helpers/binary-fbx'
import { SkinnedMesh } from 'three'
import { fbxSceneToThree } from '../tools/fbx-viewer/src/fbx-sdk-to-three'
import { fbxTreeToThree } from '../tools/fbx-viewer/src/fbx-tree-to-three'
import { snapshotScene } from '../tools/fbx-viewer/src/scene-snapshot'

function objects(doc: ReturnType<typeof parse>): Record<string, Record<string, Record<string, unknown>>> {
  return (doc.tree.Objects ?? {}) as Record<string, Record<string, Record<string, unknown>>>
}

function connections(doc: ReturnType<typeof parse>): unknown[] {
  return ((doc.tree.Connections as { connections?: unknown[] } | undefined)?.connections ?? []) as unknown[]
}

const ASCII_NAMELESS = `; FBX 6.1 nameless
FBXHeaderExtension:  {
	FBXVersion: 6100
}
Objects:  {
	Model: "Model::Face_Eye", "Mesh" {
		Vertices: *6 {
			a: 0,0,0,1,0,0
		}
		PolygonVertexIndex: *3 {
			a: 0,1,-3
		}
		Properties60:  {
			Property: "Lcl Translation", "Lcl Translation", "A+",1,2,3
		}
	}
	Model: "Model::Head", "LimbNode" {
		Properties60:  {
			Property: "Lcl Translation", "Lcl Translation", "A+",0,1,0
		}
	}
	Deformer: "Deformer::Skin", "Skin" {
	}
	Material: "Material::Body", "" {
		ShadingModel: "phong"
	}
}
Connections:  {
	Connect: "OO", "Face_Eye", "Scene"
	Connect: "OO", "Head", "Scene"
	Connect: "OO", "Skin", "Face_Eye"
	Connect: "OO", "Body", "Face_Eye"
}
`

describe('FBX 6.x 无 UniqueId：按名字索引', () => {
  it('ASCII 把多个 Model 按名字收进 bucket，连接保留名字', () => {
    const doc = parse(ASCII_NAMELESS)
    expect(doc.version).toBe(6100)

    const objs = objects(doc)
    const face = objs.Model?.Face_Eye
    const head = objs.Model?.Head
    expect(face?.attrName).toBe('Face_Eye')
    expect(face?.attrType).toBe('Mesh')
    expect(head?.attrName).toBe('Head')
    expect(head?.attrType).toBe('LimbNode')
    expect(face?.Vertices).toBeUndefined()

    const geo = Object.values(objs.Geometry ?? {}).find((g) => g.attrType === 'Mesh')
    expect(Array.from((geo?.Vertices as { a: Float64Array }).a)).toEqual([0, 0, 0, 1, 0, 0])

    expect(objs.Deformer?.Skin?.attrType).toBe('Skin')
    expect(objs.Material?.Body?.attrName).toBe('Body')

    expect(connections(doc)).toEqual(
      expect.arrayContaining([
        ['Face_Eye', 'Scene'],
        ['Head', 'Scene'],
        ['Skin', 900000],
        ['Body', 'Face_Eye'],
        [900000, 'Face_Eye'],
      ]),
    )
  })

  it('buildScene 用名字连接挂网格 / 蒙皮 / 材质', () => {
    const scene = buildScene(parse(ASCII_NAMELESS))
    const face = scene.rootNode.children.find((n) => n.name === 'Face_Eye')
    const head = scene.rootNode.children.find((n) => n.name === 'Head')
    expect(face).toBeDefined()
    expect(head).toBeDefined()
    expect(head!.nodeAttributes.some((a) => isFbxClass(a, 'FbxSkeleton'))).toBe(true)
    expect(isFbxMesh(face!.nodeAttributes[0]!)).toBe(true)
    const mesh = face!.nodeAttributes[0] as FbxMesh
    expect(Array.from(mesh.controlPoints)).toEqual([0, 0, 0, 1, 0, 0])
    expect(isFbxSkin(mesh.deformers[0]!)).toBe(true)
    expect((mesh.deformers[0] as FbxSkin).classId).toBe('FbxSkin')
    expect(face!.materials.map((m) => m.name)).toContain('Body')
  })

  it('binary 无数字 ID 的两个 Model 不会互相覆盖', () => {
    const bytes = buildBinaryFbx({
      version: 6100,
      nodes: [
        {
          name: 'Objects',
          children: [
            {
              name: 'Model',
              props: [
                { kind: 'S', value: 'Model::Face_Eye' },
                { kind: 'S', value: 'Mesh' },
              ],
              children: [
                {
                  name: 'Vertices',
                  props: [{ kind: 'array', type: 'd', values: [0, 0, 0, 1, 0, 0] }],
                  children: [{ name: 'Version', props: [{ kind: 'I', value: 124 }] }],
                },
                {
                  name: 'PolygonVertexIndex',
                  props: [{ kind: 'array', type: 'i', values: [0, 1, -3] }],
                },
              ],
            },
            {
              name: 'Model',
              props: [
                { kind: 'S', value: 'Model::Head' },
                { kind: 'S', value: 'LimbNode' },
              ],
            },
          ],
        },
        {
          name: 'Connections',
          children: [
            {
              name: 'Connect',
              props: [
                { kind: 'S', value: 'OO' },
                { kind: 'S', value: 'Face_Eye' },
                { kind: 'S', value: 'Scene' },
              ],
            },
            {
              name: 'Connect',
              props: [
                { kind: 'S', value: 'OO' },
                { kind: 'S', value: 'Head' },
                { kind: 'S', value: 'Scene' },
              ],
            },
          ],
        },
      ],
    })

    const doc = parse(bytes)
    const objs = objects(doc)
    expect(objs.Model?.Face_Eye?.attrType).toBe('Mesh')
    expect(objs.Model?.Head?.attrType).toBe('LimbNode')
    const geo = Object.values(objs.Geometry ?? {})[0]
    expect(Array.from((geo?.Vertices as { a: Float64Array }).a)).toEqual([0, 0, 0, 1, 0, 0])

    const scene = buildScene(doc)
    expect(scene.rootNode.children.map((n) => n.name).sort()).toEqual(['Face_Eye', 'Head'])
    const face = scene.rootNode.children.find((n) => n.name === 'Face_Eye')
    expect(isFbxMesh(face!.nodeAttributes[0]!)).toBe(true)
    expect(Array.from((face!.nodeAttributes[0] as FbxMesh).controlPoints)).toEqual([0, 0, 0, 1, 0, 0])
  })

  it('binary Vertices 若首项是浮点，仍提升为 .a', () => {
    const bytes = buildBinaryFbx({
      version: 6100,
      nodes: [
        {
          name: 'Objects',
          children: [
            {
              name: 'Model',
              props: [
                { kind: 'S', value: 'Model::Body' },
                { kind: 'S', value: 'Mesh' },
              ],
              children: [
                {
                  name: 'Vertices',
                  props: [
                    { kind: 'D', value: 0.5 },
                    { kind: 'D', value: 1.5 },
                    { kind: 'D', value: 2.5 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    const doc = parse(bytes)
    const geo = Object.values(objects(doc).Geometry ?? {})[0]
    expect(Array.from((geo?.Vertices as { a: Float64Array }).a)).toEqual([0.5, 1.5, 2.5])
  })

  it('fbxTreeToThree 也能按名字挂上网格', () => {
    const doc = parse(ASCII_NAMELESS)
    const result = fbxTreeToThree(doc.tree)
    expect(result.stats.meshes).toBeGreaterThanOrEqual(1)
    expect(result.meshes[0]?.geometry.getAttribute('position')?.count).toBe(3)
  })

  it('Mesh 写在 LimbNode 前面时，快照不会因未 bind 的 SkinnedMesh 崩', () => {
    const ascii = `; FBX 6.1
FBXHeaderExtension:  {
	FBXVersion: 6100
}
Objects:  {
	Model: "Model::Body", "Mesh" {
		Vertices: *9 {
			a: 0,0,0,1,0,0,0,1,0
		}
		PolygonVertexIndex: *3 {
			a: 0,1,-3
		}
	}
	Model: "Model::Hip", "LimbNode" {
	}
	Deformer: "Deformer::Skin", "Skin" {
	}
	Deformer: "Deformer::Cluster", "Cluster" {
		Indexes: *1 {
			a: 0
		}
		Weights: *1 {
			a: 1
		}
		TransformLink: *16 {
			a: 1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1
		}
	}
}
Connections:  {
	Connect: "OO", "Body", "Scene"
	Connect: "OO", "Hip", "Scene"
	Connect: "OO", "Skin", "Body"
	Connect: "OO", "Cluster", "Skin"
	Connect: "OO", "Hip", "Cluster"
}
`
    const doc = parse(ascii)
    const result = fbxTreeToThree(doc.tree)
    expect(() => snapshotScene(result.root)).not.toThrow()
    const skinned = result.meshes.find((m) => m instanceof SkinnedMesh)
    expect(skinned).toBeDefined()
    expect(skinned!.skeleton.bones.length).toBeGreaterThanOrEqual(1)

    const sdk = fbxSceneToThree(buildScene(doc))
    expect(sdk.stats.bones).toBeGreaterThanOrEqual(1)
    const sdkSkinned = sdk.meshes.find((m) => m instanceof SkinnedMesh)
    expect(sdkSkinned).toBeDefined()
    expect(sdkSkinned!.skeleton.bones.length).toBeGreaterThanOrEqual(1)
  })

  it('6.x Pose Matrix 只有 propertyList 时，SDK 蒙皮 rest 与 TransformLink 对齐', () => {
    const rootBind = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 10, 0, 1]
    const spineBind = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 15, 0, 1]
    const scene = buildScene({
      Objects: {
        Model: {
          1: { id: 1, attrName: 'Body', attrType: 'Mesh' },
          2: {
            id: 2,
            attrName: 'Bip001',
            attrType: 'Root',
            Lcl_Translation: { type: 'Lcl_Translation', value: [0, 10, 0] },
          },
          3: {
            id: 3,
            attrName: 'Spine',
            attrType: 'LimbNode',
            Lcl_Translation: { type: 'Lcl_Translation', value: [0, 5, 0] },
          },
        },
        Geometry: {
          10: {
            id: 10,
            attrName: 'Body',
            attrType: 'Mesh',
            Vertices: { a: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
            PolygonVertexIndex: { a: new Float64Array([0, 1, -3]) },
          },
        },
        Deformer: {
          30: { id: 30, attrName: 'Skin', attrType: 'Skin' },
          31: {
            id: 31,
            attrName: 'Cluster',
            attrType: 'Cluster',
            Indexes: { a: new Float64Array([0]) },
            Weights: { a: new Float64Array([1]) },
            TransformLink: { a: new Float64Array(spineBind) },
          },
        },
        Pose: {
          80: {
            id: 80,
            attrName: 'Bind',
            attrType: 'BindPose',
            PoseNode: {
              Node: 2,
              Matrix: { propertyList: rootBind },
            },
          },
        },
      },
      Connections: {
        connections: [
          [1, 0],
          [2, 0],
          [3, 2],
          [10, 1],
          [30, 10],
          [31, 30],
          [3, 31],
        ],
      },
    })

    const root = scene.rootNode.children.find((n) => n.name === 'Bip001')
    const pose = scene.poses[0]?.poseInfos.find((p) => p.node === root)
    expect(pose?.matrix?.[13]).toBeCloseTo(10)

    const sdk = fbxSceneToThree(scene)
    const skinned = sdk.meshes.find((m) => m instanceof SkinnedMesh)
    expect(skinned).toBeDefined()
    const bone = skinned!.skeleton.bones[0]
    const inv = skinned!.skeleton.boneInverses[0]
    expect(bone?.name).toBe('Spine')
    expect(bone?.matrixWorld.elements[13]).toBeCloseTo(15)
    const rest = bone!.matrixWorld.clone().multiply(inv!)
    expect(rest.elements[13]).toBeCloseTo(0)
    expect(Math.abs(rest.elements[0]! - 1)).toBeLessThan(1e-5)
  })

  it('6.x ByVertice 法线按控制点取样，与 parse 一致', () => {
    const ascii = `; FBX 6.1
FBXHeaderExtension:  {
	FBXVersion: 6100
}
Objects:  {
	Model: "Model::Face", "Mesh" {
		Vertices: *9 {
			a: 0,0,0,1,0,0,0,1,0
		}
		PolygonVertexIndex: *3 {
			a: 1,2,-1
		}
		LayerElementNormal: 0 {
			MappingInformationType: "ByVertice"
			ReferenceInformationType: "Direct"
			Normals: *9 {
				a: 1,0,0,0,1,0,0,0,1
			}
		}
	}
}
Connections:  {
	Connect: "OO", "Face", "Scene"
}
`
    const doc = parse(ascii)
    const scene = buildScene(doc)
    const node = scene.rootNode.children.find((n) => n.name === 'Face')
    const mesh = node?.nodeAttributes.find(isFbxMesh) as FbxMesh | undefined
    expect(mesh?.layers[0]?.normals?.mappingMode).toBe(FbxLayerElementMappingMode.eByControlPoint)

    const sdk = fbxSceneToThree(scene).meshes[0]
    const parsed = fbxTreeToThree(doc.tree).meshes[0]
    const sn = sdk?.geometry.getAttribute('normal')
    const pn = parsed?.geometry.getAttribute('normal')
    expect(sn).toBeDefined()
    expect(pn).toBeDefined()
    expect([sn!.getX(0), sn!.getY(0), sn!.getZ(0)]).toEqual([0, 1, 0])
    expect([pn!.getX(0), pn!.getY(0), pn!.getZ(0)]).toEqual([0, 1, 0])
  })
})
