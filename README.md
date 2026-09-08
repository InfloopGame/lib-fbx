# lib-fbx

FBX 文件解析与处理库。

## 安装

```bash
pnpm add @infloopgame/lib-fbx
```

## 使用

```ts
import { detectFormat, parse, buildScene } from '@infloopgame/lib-fbx'

const format = detectFormat(fbxBuffer) // 'binary' | 'ascii'
const doc = parse(fbxBuffer)
const scene = buildScene(doc) // 或 buildScene(doc.tree)
```

`parse()` 返回 `FbxParseResult`：`{ format, version, tree }`（文件节点树）。`buildScene()` 把 tree 组装成 SDK 风格的 `FbxScene`（节点层级、几何、材质、动画、连接）。测试放在仓库根目录 `tests/`，不与 `src` 混放。

与 Autodesk FBX SDK 2020.2.1 对齐的场景对象类型在 `src/sdk/`（`FbxScene` / `FbxNode` / `FbxMesh` 等），由包入口再导出。`FbxDocument` 现在指 SDK 文档对象，不是 parse 结果。

**数字数组类型**：从 v0.0.x 开始，binary 与 ASCII 两端解析出的 int32 / int64 / float32 / float64 数组（如 `Vertices.a` / `PolygonVertexIndex.a` / `KeyTime.a` / `Matrix.a`）**统一返回 `Float64Array`**。3-元素 tuple（如 `Lcl_Translation.value`）保留 `number[]`。Boolean 数组和字节 blob（`Content` 等）不变。下游若需要 `number[]`，用 `Array.from(v)` 转换即可。

## 开发

```bash
pnpm install
pnpm test          # 单元测试
pnpm test:coverage # 覆盖率
pnpm lint
pnpm typecheck
pnpm build
pnpm ci            # lint + typecheck + coverage + build
pnpm bench                            # 测 parse() + buildScene()（tests/fixtures）
pnpm bench -- D:/models               # 递归指定目录下所有 .fbx
pnpm bench -- --iterations 5 D:/models # 每文件跑 N 次取中位数（默认 3）
pnpm viewer                           # Three.js 查看器（本库 parse + buildScene 导入）

# 官方 SDK 对照：先设 FBX_SDK_ROOT，再编译 tools/fbx-dump（见该目录 README）
#   set FBX_SDK_ROOT=D:\Tools\FBX SDK\2020.2.1
#   tools\fbx-dump\build.bat
#   fbx-dump.exe scene.fbx [-o out.json]

# inflate 对比（诊断压缩数据一致性问题时用：fflate vs node:zlib）
pnpm tsx scripts/verify-inflate.ts path/to/file.fbx
```

## CI / 发布

- **CI**：push / PR 到 `main` 时，在 Node 20/22/24 上跑 lint、类型检查、覆盖率测试和构建。
- **发布**：推送 `v*` tag（例如 `v0.1.0`）后，GitHub Actions 用 npm Trusted Publishing（OIDC）发布。仓库是私有的，npm 不会生成 provenance。

发布前：

1. 把 `package.json` 的 `version` 改成目标版本（与 tag 去掉 `v` 后一致）。
2. 在 [npm Trusted Publisher](https://docs.npmjs.com/trusted-publishers) 绑定（包还不存在时可用 CLI）：
   - npm 包名：`@infloopgame/lib-fbx`
   - GitHub Organization：`InfloopGame`
   - Repository：`lib-fbx`
   - Workflow filename：`publish.yml`
   - Allowed actions：勾选 **npm publish**（2026-09-03 之后新建配置默认只允许 stage）

   ```bash
   npm trust github @infloopgame/lib-fbx \
     --file publish.yml \
     --repo InfloopGame/lib-fbx \
     --allow-publish \
     -y
   ```
3. 推送 tag：

```bash
git tag v0.1.0
git push origin v0.1.0
```

也可在 Actions 里手动跑 **Publish**（默认 dry-run，只打包不发布）。

## License

MIT
