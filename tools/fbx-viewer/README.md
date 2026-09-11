# FBX Three.js viewer

用本仓库 `parse` + 两条独立转 Three 路径查看 FBX：

- **SDK**：`buildScene` → `fbxSceneToThree`
- **parse**：对照 three.js `FBXLoader` 的 `FBXTreeParser`，直接 `tree → Three`（不走 `buildScene`）

加载后会对两份 `Group` 做快照 diff（名字路径、世界矩阵、顶点数、包围盒、骨骼数）。HUD 可切换 SDK / parse / 对照（parse 洋红线框叠加）。

贴图路径多为 DCC 绝对路径，浏览器里加载不到，目前用漫反射色 / 顶点色。

蒙皮绑定对齐 three.js r184：先应用 Lcl，再 `boneInverse = Inverse(TransformLink)`，`bind(skeleton, mesh.matrixWorld)`，不用 Cluster.Transform。

```bash
pnpm viewer
```

打开 http://127.0.0.1:4173 ，选择或拖入 `.fbx`。右侧层级树展示 `FbxScene` 节点；点击节点会用 BoxHelper 高亮，不移动相机。Z-up 文件会绕 X 转 -90° 转到 Three.js 的 Y-up（与 FBXLoader 相同）。
