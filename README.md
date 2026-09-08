# @infloopgame/lib-fbx

解析 FBX（Binary / ASCII，6000–7xxx），并组装成与 Autodesk FBX SDK 2020.2.1 对齐的只读场景对象图。

本包**不依赖 Three.js**。需要渲染时自行把 `FbxScene` 转成 `THREE.Object3D`（下面有示例）。不做动画求值（`AnimEvaluator` / 采样）。

## 安装

```bash
pnpm add @infloopgame/lib-fbx
# 若用 Three.js 渲染，另装：
pnpm add three
```

## 解析

输入 `ArrayBuffer` / `Uint8Array` / `Buffer`：

```ts
import { detectFormat, parse, buildScene } from '@infloopgame/lib-fbx'

const format = detectFormat(fbxBytes) // 'binary' | 'ascii'
const doc = parse(fbxBytes)           // FbxParseResult: { format, version, tree }
const scene = buildScene(doc)         // 或 buildScene(doc.tree)
```

浏览器：

```ts
const bytes = new Uint8Array(await file.arrayBuffer())
const scene = buildScene(parse(bytes))
```

- `parse()` 得到文件节点树（`FbxParseResult`）。`FbxDocument` / `FbxScene` / `FbxNode` 是 SDK 对象，不是 parse 结果。
- `buildScene()` 把 tree 编成 `FbxScene`：节点层级、Mesh / Skin / 材质 / 动画曲线 / Pose / 轴系。
- 几何数组（`Vertices.a`、`controlPoints`、`polygonIndexes`、`KeyTime.a` 等）是 **`Float64Array`**；`Lcl_Translation` 这类 3 元组仍是 `number[]`。需要 `number[]` 时用 `Array.from(v)`。

常用字段：

```ts
scene.rootNode          // FbxNode 树
scene.globalSettings.axisSystem.upVector
scene.materials
scene.animStacks        // 曲线在，未采样
```

节点上：`children`、`nodeAttributes`（含 `FbxMesh`）、`lclTranslation` / `lclRotation` / `lclScaling`（度）、`materials`。网格：`controlPoints`（xyz 交错）、`polygonIndexes`（多边形末顶点为负：`~index`）。

## Three.js

本库不导出 Loader。流程是 `parse` → `buildScene` → 遍历 `FbxNode` 建 `BufferGeometry`。

下面是静态网格的最小接入（欧拉默认 `ZYX`，对齐多数 FBX）。蒙皮、pivot、inheritType 见文末注意。

```ts
import {
  buildScene,
  parse,
  FbxAxisUpVector,
  isFbxMesh,
  type FbxMesh,
  type FbxNode,
} from '@infloopgame/lib-fbx'
import {
  BufferAttribute,
  BufferGeometry,
  Euler,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three'

const DEG = Math.PI / 180

function meshGeometry(mesh: FbxMesh): BufferGeometry {
  const cps = mesh.controlPoints
  const idx = mesh.polygonIndexes
  const pos: number[] = []
  const poly: number[] = []
  const tri = (a: number, b: number, c: number) => {
    for (const i of [a, b, c]) {
      pos.push(cps[i * 3]!, cps[i * 3 + 1]!, cps[i * 3 + 2]!)
    }
  }
  for (let i = 0; i < idx.length; i++) {
    const v = idx[i]!
    if (v >= 0) {
      poly.push(v)
      continue
    }
    poly.push(-v - 1)
    for (let t = 1; t < poly.length - 1; t++) tri(poly[0]!, poly[t]!, poly[t + 1]!)
    poly.length = 0
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  geo.computeVertexNormals()
  return geo
}

function addNode(node: FbxNode, parent: Object3D): void {
  const obj = new Group()
  obj.name = node.name
  const t = node.lclTranslation?.value
  const r = node.lclRotation?.value
  const s = node.lclScaling?.value
  if (t) obj.position.set(t[0], t[1], t[2])
  if (r) {
    obj.rotation.copy(new Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'ZYX'))
  }
  if (s) obj.scale.set(s[0], s[1], s[2])
  parent.add(obj)

  for (const attr of node.nodeAttributes) {
    if (!isFbxMesh(attr)) continue
    obj.add(new Mesh(meshGeometry(attr), new MeshStandardMaterial({ color: 0xcccccc })))
  }
  for (const child of node.children) addNode(child, obj)
}

export function fbxToThree(fbxBytes: Uint8Array): Group {
  const fbx = buildScene(parse(fbxBytes))
  const root = new Group()
  addNode(fbx.rootNode, root)
  // Three.js 是 Y-up；Z-up 文件绕 X -90°（与 FBXLoader 相同）
  if (fbx.globalSettings.axisSystem.upVector === FbxAxisUpVector.eZAxis) {
    root.rotation.x = -Math.PI / 2
  }
  return root
}

// const model = fbxToThree(bytes)
// scene.add(model)
```

蒙皮与材质注意：

- 绑定矩阵用 **`Inverse(Cluster.TransformLink)`**，再 `mesh.bind(skeleton, mesh.matrixWorld)`。不要用 `Cluster.Transform`（SDK 导入后的轴转换与文件不一致）。
- 节点局部矩阵若要对齐 `FBXLoader`，需 `getEulerOrder`（FBX 外旋 → three 内旋）+ `generateTransform`（pivot / inheritType），不能只设 `position` / `rotation` / `scale`。
- 贴图路径多为 DCC 绝对路径，浏览器里经常加载不到；可用材质 `Diffuse` 或顶点色兜底。
- 本库不采样动画曲线，骨骼姿势是文件里的 Lcl，不是某一帧的求值结果。

## License

MIT
