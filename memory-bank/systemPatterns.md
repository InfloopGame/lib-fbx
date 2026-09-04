# System Patterns

- 入口：`src/index.ts` 再导出 detect / parse / parseWasm / `buildScene` / FbxError / version，以及 `src/sdk/` 的 FBX SDK 风格场景类型。
- 两层数据：parse tree（`src/types.ts`，`FbxParseResult` / `FbxTreeNode` / `FbxTreeProperty`）与 SDK 对象图（`src/sdk/`，`FbxScene` / `FbxNode` / `FbxProperty<T>`）。`buildScene` 负责 tree → Scene。
- 小支撑收在 `src/util.ts`：`toBytes` / `toArrayBuffer` / `FbxError` / `FbxTree` / `version`。
- 错误用 `FbxError` + `code`（`EMPTY_INPUT` | `UNKNOWN_FORMAT` | `UNSUPPORTED_VERSION` | `INVALID_DATA`）。
- 构建：tsup 产出 ESM + CJS + d.ts。
- 测试：根目录 `tests/`（不放 `src`），vitest，覆盖率统计只含 `src`，排除 `src/types.ts`、`src/sdk` 类型文件（保留 `guards.ts` / `build-scene.ts`）、`src/wasm/pkg/**` 与 `src/wasm/inline.ts`。
- Benchmark：`scripts/fbx-benchmark.ts`，`pnpm bench -- <dir>` 递归扫 `.fbx` 统计 parse 耗时。
- 官方 SDK 金标准：`tools/fbx-dump/fbx-dump.exe` 导出 JSON scene。Three.js 查看器：`tools/fbx-viewer/`（`pnpm viewer`），`parse` + `buildScene` → Three.js 网格/蒙皮。节点局部矩阵对齐 three.js FBXLoader：`getEulerOrder`（FBX 外旋→内旋）+ `generateTransform`（pivot / inheritType）。蒙皮 `boneInverse = Inverse(TransformLink)`，`mesh.bind(skeleton, mesh.matrixWorld)`。
- 发布：tag `v*` → `.github/workflows/publish.yml`，npm OIDC Trusted Publishing + provenance。

## Rust/WASM 后端

- Rust crate 在 `crates/fbx-wasm/`：`wasm-bindgen` + `serde-wasm-bindgen` + `indexmap` + `miniz_oxide`，行为逐条对齐 TS 的 `BinaryReader` / `BinaryParser` / `inflate`。
- 生成产物：`src/wasm/pkg/`（wasm-bindgen web target 的 ESM 胶水 + `.wasm`），以及由 `scripts/build-wasm.mjs` 生成的 `src/wasm/inline.ts`（base64 内联 wasm 字节）。
- 加载器：`src/wasm/loader.ts` 用 `atob` 解码 base64、传给 wasm-bindgen `init({ module_or_path: bytes })`，模块实例缓存为单例。
- 公共 API：`parseWasm(input): Promise<FbxParseResult>` 与 `ensureWasmReady()`，前者对 binary 走 wasm 后端，ascii 抛 `UNKNOWN_FORMAT`。
- 数据一致性：整数/浮点统一在 Rust 侧折算为 f64，与 TS 侧的 JavaScript number 精度对齐；`R` 属性在 wasm 侧输出为 `Uint8Array`（与 TS 的 ArrayBuffer 二进制等价，仅类型不同）。
- **数字数组类型**：TS 与 wasm 两端的 int32/int64/float32/float64 数组统一为 `Float64Array`（wasm 侧 `Float64Array::from` 一次性拷出，TS 侧 `BinaryReader` 走 `slice → new TypedArray(buf) → new Float64Array(view)` 快路径）。3-tuple（Vector3D/Color/Lcl_* 等）保留 `number[]`，boolean 数组保留 `boolean[]`。
- CI：`wasm-check` job 装 rust + wasm-pack，`pnpm build:wasm` 后 `git diff --exit-code` 验证 `src/wasm/pkg` 与 `src/wasm/inline.ts` 与 Rust 源保持同步。
