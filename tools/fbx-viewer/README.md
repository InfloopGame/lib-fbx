# FBX Three.js viewer

用本仓库 `parse` + 两条独立转 Three 路径查看 FBX：

- **SDK**：`buildScene` → `fbxSceneToThree`
- **parse**：对照 three.js `FBXLoader` 的 `FBXTreeParser`，直接 `tree → Three`（不走 `buildScene`）

两条路径独立读取数据、建立节点和骨骼关系，共用以下 Three 转换模块：

- `src/fbx-transform.ts`：局部变换、旋转顺序和 FBX 矩阵转换。
- `src/fbx-three-geometry.ts`：统一图层采样、多边形展开、权重归一化、顶点属性和材质分组。
- `src/fbx-three-common.ts`：Phong 材质创建、蒙皮绑定和统计类型。

SDK 保留子 Mesh 上的几何变换，parse 将几何变换烘焙到顶点和法线；骨骼索引映射和 BindPose 读取仍由各路径负责。公共算法使用固定预期测试验证，不仅依赖两条路径互相比对。

加载后会对两份 `Group` 做快照 diff（名字路径、世界矩阵、顶点数、包围盒、骨骼数）。HUD 可切换 SDK / parse / 对照（parse 洋红线框叠加）。

贴图路径多为 DCC 绝对路径，浏览器里加载不到，目前用漫反射色 / 顶点色。

蒙皮绑定对齐 three.js r184：先应用 Lcl，再 `boneInverse = Inverse(TransformLink)`，`bind(skeleton, mesh.matrixWorld)`，不用 Cluster.Transform。

### FBX 6.x 兼容性

FBX 6.1 的节点、Skin/Cluster 连接和 BindPose 引用可能使用名称，而非数字 UniqueId。示例沿用 `FbxRef`、`objectRef`、`parseConnRef` 和 `refKey` 统一查找，保留原始名称与数字 ID，不对名称调用 `parseInt`，也不修改原始树做数字重编号。未连接到父节点的 Skin 会在建立骨架前跳过，避免干扰有效网格的分类。

`tests/viewer-legacy-skinning.test.ts` 使用从 Avatar 示例同步的 `legacy-skinned-triangle.fbx`，覆盖 SDK / parse 两条路径的混合 ID、名称 BindPose、类型化权重、克隆后的独立蒙皮及孤立 Skin。Viewer 不缓存解析失败，失败后可重新加载文件。

### 启动

```bash
pnpm viewer
```

打开 http://127.0.0.1:4173 ，选择或拖入 `.fbx`。右侧层级树展示 `FbxScene` 节点；点击节点会用 BoxHelper 高亮，不移动相机。Z-up 文件会绕 X 转 -90° 转到 Three.js 的 Y-up（与 FBXLoader 相同）。
