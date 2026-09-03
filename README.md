# lib-fbx

FBX 文件解析与处理库。

## 安装

```bash
pnpm add lib-fbx
```

## 使用

```ts
import { detectFormat, parse } from 'lib-fbx'

const format = detectFormat(fbxBuffer) // 'binary' | 'ascii'
const scene = parse(fbxBuffer)
```

`parse()` 返回 `{ format, version, tree }`。测试放在仓库根目录 `tests/`，不与 `src` 混放。

**数字数组类型**：从 v0.0.x 开始，binary 与 ASCII 两端解析出的 int32 / int64 / float32 / float64 数组（如 `Vertices.a` / `PolygonVertexIndex.a` / `KeyTime.a` / `Matrix.a`）**统一返回 `Float64Array`**，与 wasm 后端对齐。3-元素 tuple（如 `Lcl_Translation.value`）保留 `number[]`。Boolean 数组和字节 blob（`Content` 等）不变。下游若需要 `number[]`，用 `Array.from(v)` 转换即可。

### Rust/WASM 后端（可选）

针对 binary FBX 提供了纯 Rust 的可选后端，通过内联 base64 打包在 npm 包内，无需额外文件或 fetch：

```ts
import { parseWasm, ensureWasmReady } from 'lib-fbx'

// 首次调用会异步初始化 wasm 模块；后续调用复用
const doc = await parseWasm(fbxBuffer)

// 也可提前预热
await ensureWasmReady()
```

- 仅支持 binary FBX；ASCII 请继续用 `parse()`
- 返回结构与 `parse()` 一致（`FbxDocument`）；FBX 6.x 也会走 `normalizeFbx6Tree`
- 数字数组已在两端统一为 `Float64Array`（详见上文"数字数组类型"）
- 内部实现字段 `propertyList` / `singleProperty` 可能与 `parse()` 有差异（wasm 侧对这两个字段做了 move 优化避免 clone 巨型数组）；用户可见的 `.a` / `.value` / `id` / `attrName` 等字段完全对齐
- Rust 源码在 `crates/fbx-wasm/`；生成物在 `src/wasm/pkg/` 与 `src/wasm/inline.ts`

**性能特征**（Windows / Node 26 实测，动画类 FBX 目录）：

- 4-6 MB 大文件：wasm ≈ **3.8-3.9× 快**
- 2-3 MB 中大文件：wasm ≈ 2-3.6× 快
- 1.5-2 MB 中等文件：wasm ≈ 2× 快
- < 1.5 MB 小文件（TS 自身 <20 ms）：wasm 反而慢 0.4-0.7×

wasm 有约 30 ms 固定开销（wasm 调用 + `Object`/`Reflect::set` 构造 tree + `Float64Array` 拷贝），只有数据密集型文件才能摊销回来。若目标是大量小 FBX，仍推荐 TS 后端。

## 开发

```bash
pnpm install
pnpm test          # 单元测试
pnpm test:coverage # 覆盖率
pnpm lint
pnpm typecheck
pnpm build
pnpm ci            # lint + typecheck + coverage + build
pnpm bench                            # 同时测 TS 与 WASM 后端加载速度（tests/fixtures）
pnpm bench -- D:/models               # 递归指定目录下所有 .fbx
pnpm bench -- --iterations 5 D:/models # 每文件每后端跑 N 次取中位数（默认 3）
pnpm bench -- --js-only D:/models     # 仅 TS 后端
pnpm bench -- --wasm-only D:/models   # 仅 Rust/WASM 后端（自动跳过 ascii）
pnpm bench -- --diff D:/models        # 两端解析结果一致性对比（TS parse vs WASM parseWasm）

# 三方 inflate 对比（诊断压缩数据一致性问题时用）
pnpm tsx scripts/verify-inflate.ts path/to/file.fbx

# 重新生成 wasm 后端（需要 Rust + wasm32-unknown-unknown target；wasm-pack 已在 devDependencies）
pnpm build:wasm
```

改动 `crates/fbx-wasm/` 里的 Rust 代码后必须 `pnpm build:wasm` 并把 `src/wasm/pkg/` 与 `src/wasm/inline.ts` 一起提交，CI 会校验产物与源码是否同步。

## CI / 发布

- **CI**：push / PR 到 `main` 时，在 Node 20/22/24 上跑 lint、类型检查、覆盖率测试和构建。
- **发布**：推送 `v*` tag（例如 `v0.0.1`）后，GitHub Actions 用 npm Trusted Publishing（OIDC）发布，并附带 provenance。

发布前：

1. 把 `package.json` 的 `version` 改成目标版本（与 tag 去掉 `v` 后一致）。
2. 在 [npm Trusted Publisher](https://docs.npmjs.com/trusted-publishers) 绑定：
   - Organization：`InfloopGame`
   - Repository：`lib-fbx`
   - Workflow filename：`publish.yml`
3. 推送 tag：

```bash
git tag v0.0.1
git push origin v0.0.1
```

也可在 Actions 里手动跑 **Publish**（默认 dry-run，只打包不发布）。

## License

MIT
