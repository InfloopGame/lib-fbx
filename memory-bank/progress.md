# Progress

已完成：

- TypeScript ESM 库脚手架（tsup dual package）
- `detectFormat` / `FbxError` / `parse` 占位与 binary/ascii 解析
- vitest 覆盖率（当前门槛 lines/statements 85 / branches 70 / functions 99）
- CI（lint / typecheck / coverage / build，Node 20/22/24）
- Publish（`v*` tag，OIDC + provenance）
- TS 侧数字数组统一 `Float64Array`（binary + ASCII 两个 parser）；`BinaryReader` 走 slice+typed-array 快路径
- 手写 190 行 DEFLATE 换成 `fflate.unzlibSync`：17.3MB 动画 1515ms→817ms（1.85x），inflate 覆盖率 65%→100%
- SDK 对齐的 TypeScript 场景数据模型（`src/sdk/`）：Math/Time/Object/Property + 完整 scene 类层次（Mesh/NURBS/Constraint/Character 等）与 classId 守卫；parse 结果改名为 `FbxParseResult`
- `buildScene()`：tree / `FbxParseResult` → `FbxScene`（节点层级、Mesh/Skin/材质/动画/Pose/DisplayLayer/轴系）
- `tools/fbx-dump`：基于 Autodesk FBX SDK 2020.2.1 的 scene JSON 导出 exe，用于对照本库对象图
- `tools/fbx-viewer`：Three.js 查看器，`pnpm viewer`；蒙皮绑定对齐 TransformLink + `mesh.matrixWorld`；骨骼场景姿势对齐 FBX 欧拉外旋/`generateTransform`；右侧 Outliner 展示 SDK 场景图，点选只高亮不改相机
- 已移除 Rust/WASM 可选后端（crate、`parseWasm`、CI `wasm-check`、内联产物）：固定开销与双实现成本高于收益，解析只保留 TS `parse()`
- 解析实现收到 `src/parse/`（detect / binary / ascii / inflate / FBX6 normalize），公共 API 仍从包入口再导出
- `parse()` 支持 FBX 6000（与 6100 同属 6.x：32 位偏移 + Properties60 + 内嵌几何 normalize）；ASCII `Connect:` 视为 `C:`；`< 6000` 仍拒绝

未完成：

- FBX 几何 / 动画求值（AnimEvaluator / 局部变换）
- 其它 fixture 的 dump 金标准铺开（仓库未收录大型角色 FBX）
- 补齐 `inflate` / `binary-reader` / `text-parser` 分支覆盖，把覆盖率门槛抬回 100
- 首次发布前需在 npmjs.com 为 `@infloopgame/lib-fbx` 配置 Trusted Publisher（允许 `npm publish`）
