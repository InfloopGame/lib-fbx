# Tech Context

- Node >= 20，pnpm 11（`packageManager` 锁定）。
- TypeScript、tsup、vitest、eslint flat + typescript-eslint。
- Runtime 依赖：`fflate`（zlib 解压，取代原手写 DEFLATE）。
- CI：GitHub Actions，矩阵 Node 20/22/24。
- 包名：`@infloopgame/lib-fbx`（npm 组织 `infloopgame`）。
- 锁文件必须对 `registry.npmjs.org` 解析。仓库根 `.npmrc` 固定官方源，避免 verdaccio / npmmirror 把 tarball URL 写进 `pnpm-lock.yaml`（CI 的供应链校验会失败）。
- 发布：npm Trusted Publishing，workflow 文件名必须是 `publish.yml`；不要在 publish job 里设置空的 `registry-url` / `NODE_AUTH_TOKEN`，以免挡住 OIDC。新建 Trusted Publisher 须显式允许 `npm publish`。

## FBX SDK dump 工具

- 源码：`tools/fbx-dump/`，静态链接 Autodesk FBX SDK 的 vs2019 x64 release `/MD` 库。SDK 根目录由环境变量 `FBX_SDK_ROOT`（或 `FBXSDK_ROOT`）定位，也可传 `-DFBX_SDK_ROOT=<path>`。
- 编译：先 `set FBX_SDK_ROOT=...`，再跑 `tools/fbx-dump/build.bat`，或 CMake `Visual Studio 17 2022` + `cmake --build build --config Release`。
- 产物：`tools/fbx-dump/fbx-dump.exe`（gitignore）。JSON 含 objects / properties / connections / typed（Mesh/Skin/AnimCurve 等）。

## Three.js 查看器

- `tools/fbx-viewer/`，`pnpm viewer` → Vite `127.0.0.1:4173`（Windows 上 5173 常被 Hyper-V 排除）。
- 别名直连 `src/index.ts`，用 `parse` + `buildScene`，不走 three `FBXLoader`。节点矩阵对齐 FBXLoader 的 `getEulerOrder` + `generateTransform`；蒙皮 `Inverse(TransformLink)`。
- 依赖：`three`、`vite`（根目录 devDependencies）。
