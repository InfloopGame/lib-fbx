# FBX Three.js viewer

用本仓库 `parse` / `parseWasm` + `buildScene` 导入 FBX，转成 Three.js 场景查看。

不走 three 自带的 `FBXLoader`。贴图路径多为 DCC 绝对路径，浏览器里加载不到，目前用漫反射色 / 顶点色。

蒙皮绑定对齐 three.js r184：先应用 Lcl，再 `boneInverse = Inverse(TransformLink)`，`bind(skeleton, mesh.matrixWorld)`，不用 Cluster.Transform。

```bash
pnpm viewer
```

打开 http://127.0.0.1:4173 ，拖入 `.fbx`，或点「加载 MuscleMan fixture」。
