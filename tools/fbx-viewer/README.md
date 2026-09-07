# FBX Three.js viewer

用本仓库 `parse` + `buildScene` 导入 FBX，转成 Three.js 场景查看。

不走 three 自带的 `FBXLoader`。贴图路径多为 DCC 绝对路径，浏览器里加载不到，目前用漫反射色 / 顶点色。

蒙皮绑定对齐 three.js r184：先应用 Lcl，再 `boneInverse = Inverse(TransformLink)`，`bind(skeleton, mesh.matrixWorld)`，不用 Cluster.Transform。

```bash
pnpm viewer
```

打开 http://127.0.0.1:4173 ，选择或拖入 `.fbx`。右侧层级树展示 `FbxScene` 节点；点击节点会用 BoxHelper 高亮，不移动相机。Z-up 文件会绕 X 转 -90° 转到 Three.js 的 Y-up（与 FBXLoader 相同）。
