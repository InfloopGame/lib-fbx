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

未完成：

- FBX 几何 / 动画高层建模（当前只有 tree/属性）
- 补齐 `inflate` / `binary-reader` / `text-parser` 分支覆盖，把覆盖率门槛抬回 100
- wasm 后端支持 ASCII（可选）
- 首次发布前需在 npmjs.com 配置 Trusted Publisher
