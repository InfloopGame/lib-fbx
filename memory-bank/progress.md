# Progress

已完成：

- TypeScript ESM 库脚手架（tsup dual package）
- `detectFormat` / `FbxError` / `parse` 占位与 binary/ascii 解析
- vitest 覆盖率（当前门槛 lines/statements 85 / branches 70 / functions 100；引入 Rust 后端时暂降，待补齐）
- CI（lint / typecheck / coverage / build，Node 20/22/24）
- Publish（`v*` tag，OIDC + provenance）
- Rust/WASM 后端 `parseWasm()`：`crates/fbx-wasm/` + `src/wasm/pkg/` + `src/wasm/inline.ts`
- CI `wasm-check` job：装 rust + wasm-pack、`pnpm build:wasm`、`git diff --exit-code` 验证产物一致
- TS 侧数字数组统一 `Float64Array`（binary + ASCII 两个 parser），与 wasm 后端对齐；`BinaryReader` 走 slice+typed-array 快路径
- 手写 190 行 DEFLATE 换成 `fflate.unzlibSync`：17.3MB 动画 1515ms→817ms（1.85x），inflate 覆盖率 65%→100%
- SDK 对齐的 TypeScript 场景数据模型（`src/sdk/`）：Math/Time/Object/Property + 完整 scene 类层次（Mesh/NURBS/Constraint/Character 等）与 classId 守卫；parse 结果改名为 `FbxParseResult`
- `buildScene()`：tree / `FbxParseResult` → `FbxScene`（节点层级、Mesh/Skin/材质/动画/Pose/DisplayLayer/轴系）
- `tools/fbx-dump`：基于 Autodesk FBX SDK 2020.2.1 的 scene JSON 导出 exe，用于对照本库对象图
- 角色文件 `20269546453281.fbx` 全量 SDK gold：`tests/fixtures/20269546453281.sdk-gold.json` + `tests/sdk-gold-character.test.ts`
- `tools/fbx-viewer`：Three.js 查看器，`pnpm viewer`；蒙皮绑定对齐 TransformLink + `mesh.matrixWorld`；骨骼场景姿势对齐 FBX 欧拉外旋/`generateTransform`（见 `fbx-skin-bind-fix.md`）
- 角色 fixture `20269546453281.fbx` 的 `buildScene` 金标准（`tests/fixtures/20269546453281.sdk-gold.json`）：层级、TRS、Mesh/Skin/Cluster(TransformLink)、材质、DisplayLayer 成员数、贴图路径、轴系

未完成：

- FBX 几何 / 动画求值（AnimEvaluator / 局部变换）
- 其它 fixture 的 dump 金标准铺开
- 补齐 `inflate` / `binary-reader` / `text-parser` 分支覆盖，把覆盖率门槛抬回 100
- wasm 后端支持 ASCII（可选）
- 首次发布前需在 npmjs.com 为 `@infloopgame/lib-fbx` 配置 Trusted Publisher（允许 `npm publish`）
