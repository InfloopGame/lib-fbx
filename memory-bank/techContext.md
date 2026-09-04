# Tech Context

- Node >= 20，pnpm 11（`packageManager` 锁定）。
- TypeScript、tsup、vitest、eslint flat + typescript-eslint。
- Runtime 依赖：`fflate`（zlib 解压，取代原手写 DEFLATE）。
- CI：GitHub Actions，矩阵 Node 20/22/24；额外 `wasm-check` job 验证 Rust 产物一致性。
- 包名：`@infloopgame/lib-fbx`（npm 组织 `infloopgame`）。
- 发布：npm Trusted Publishing，workflow 文件名必须是 `publish.yml`；不要在 publish job 里设置空的 `registry-url` / `NODE_AUTH_TOKEN`，以免挡住 OIDC。新建 Trusted Publisher 须显式允许 `npm publish`。

## Rust/WASM 工具链

- Rust stable（本地 Windows 需 GNU toolchain 或已装 MSVC；仓库不强制 `rust-toolchain.toml`）。
- 依赖 `wasm32-unknown-unknown` target 与 `wasm-pack`（作为 npm devDependency 已安装，下载对应平台预编译二进制）。
- `pnpm build:wasm` 会调用 `wasm-pack build --target web --release crates/fbx-wasm --out-dir src/wasm/pkg`，然后把 `fbx_wasm_bg.wasm` base64 内联到 `src/wasm/inline.ts`。
- Windows 用户如果 MSVC 环境不完整，可临时 `RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-gnu pnpm build:wasm`；CI 用 Ubuntu 默认 GNU toolchain。
- `wasm-opt` 通过 Cargo.toml 的 `[package.metadata.wasm-pack.profile.release]` 传 `--enable-bulk-memory` 等 flag，以支持较新 wasm feature 集。release profile 用 `opt-level = 3` + `wasm-opt -O3`（性能优先，体积略大）。
- **不要**引入 `serde-wasm-bindgen`：它把 `Vec<f64>` 逐元素 `Array::set`，几十万级动画曲线会慢几十倍。走 `js-sys` 手写 `to_js`，数字数组用 `Float64Array::from`。
- Rust 侧要极力避免 `.cloned()` 大 IndexMap / 大 Vec；用 `get_mut` / `shift_remove` / `std::mem::replace` 就地改写。
