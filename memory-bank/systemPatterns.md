# System Patterns

- 入口：`src/index.ts` 再导出 detect / parse / `buildScene` / FbxError / version，以及 `src/sdk/` 的 FBX SDK 风格场景类型。
- 两层数据：parse tree（`src/types.ts`，`FbxParseResult` / `FbxTreeNode` / `FbxTreeProperty`）与 SDK 对象图（`src/sdk/`，`FbxScene` / `FbxNode` / `FbxProperty<T>`）。`buildScene` 负责 tree → Scene。
- 小支撑收在 `src/util.ts`：`toBytes` / `toArrayBuffer` / `FbxError` / `FbxTree` / `version`。
- 错误用 `FbxError` + `code`（`EMPTY_INPUT` | `UNKNOWN_FORMAT` | `UNSUPPORTED_VERSION` | `INVALID_DATA`）。
- 构建：tsup 产出 ESM + CJS + d.ts。
- 测试：根目录 `tests/`（不放 `src`），vitest，覆盖率统计只含 `src`，排除 `src/types.ts`、`src/sdk` 类型文件（保留 `guards.ts` / `build-scene.ts`）。
- Benchmark：`scripts/fbx-benchmark.ts`，`pnpm bench -- <dir>` 递归扫 `.fbx` 统计 `parse()` 耗时。
- 官方 SDK 金标准：`tools/fbx-dump/fbx-dump.exe` 导出 JSON scene。Three.js 查看器：`tools/fbx-viewer/`（`pnpm viewer`），`parse` + `buildScene` → Three.js 网格/蒙皮。节点局部矩阵对齐 three.js FBXLoader：`getEulerOrder`（FBX 外旋→内旋）+ `generateTransform`（pivot / inheritType）。蒙皮 `boneInverse = Inverse(TransformLink)`，`mesh.bind(skeleton, mesh.matrixWorld)`。
- 发布：tag `v*` → `.github/workflows/publish.yml`，npm OIDC Trusted Publishing + provenance。

## 数字数组类型

int32/int64/float32/float64 数组统一为 `Float64Array`（`BinaryReader` 走 `slice → new TypedArray(buf) → new Float64Array(view)` 快路径）。3-tuple（Vector3D/Color/Lcl_* 等）保留 `number[]`，boolean 数组保留 `boolean[]`，byte blob 仍是 `ArrayBuffer`。
