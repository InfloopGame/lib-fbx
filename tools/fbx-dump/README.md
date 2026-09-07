# fbx-dump

用 Autodesk FBX SDK 导入场景，导出 JSON，作为本库 `buildScene()` 对象图的对照金标准。

Windows x64。对齐目标是 **SDK 2020.2.1**。

## 依赖

- Autodesk FBX SDK（vs2019 x64 release `/MD`：`libfbxsdk-md.lib` / `libxml2-md.lib` / `zlib-md.lib`）
- Visual Studio 2022（含 C++ 工具链）。`build.bat` 优先 Ninja，没有则用 VS 生成器

SDK 根目录**必须**用环境变量定位，不写死路径：

| 变量 | 说明 |
| --- | --- |
| `FBX_SDK_ROOT` | 首选。指向 SDK 安装根，其下要有 `include/fbxsdk.h` |
| `FBXSDK_ROOT` | 备用，仅当 `FBX_SDK_ROOT` 未设时使用 |

也可在 CMake 上传 `-DFBX_SDK_ROOT=<path>`，优先级高于环境变量。

```bat
set FBX_SDK_ROOT=D:\Tools\FBX SDK\2020.2.1
```

用户级持久化：

```bat
setx FBX_SDK_ROOT "D:\Tools\FBX SDK\2020.2.1"
```

`setx` 只影响之后新开的终端。

## 编译

```bat
set FBX_SDK_ROOT=D:\Tools\FBX SDK\2020.2.1
tools\fbx-dump\build.bat
```

产物复制到 `tools/fbx-dump/fbx-dump.exe`（gitignore，不入库）。

手动 CMake：

```bat
cmake -S tools/fbx-dump -B tools/fbx-dump/build -G "Visual Studio 17 2022" -A x64
cmake --build tools/fbx-dump/build --config Release
```

未设变量、或根目录缺少 `include/fbxsdk.h` 时，配置阶段直接失败。

库目录固定为 `${FBX_SDK_ROOT}/lib/vs2019/x64/release`。若本机 SDK 不是这个布局，需要改 `CMakeLists.txt`。

## 用法

```bat
fbx-dump.exe scene.fbx
fbx-dump.exe scene.fbx -o out.json
fbx-dump.exe scene.fbx --compact
fbx-dump.exe scene.fbx --stdout
```

| 参数 | 说明 |
| --- | --- |
| `-o <path>` | 输出路径。省略时写到同目录 `scene.sdk.json` |
| `--compact` | 压缩 JSON |
| `--stdout` | 写到标准输出（`-o -` 同样） |
| `-h` / `--help` | 用法 |

`*.sdk.json` 已 gitignore。

## JSON 结构

顶层字段：`sdkVersion`、`file`、`scene`、`objectCount`、`objects`、`connections`。

`objects[]` 每项含 `uniqueId` / `name` / `classId` / `properties` / `typed`。`typed` 按类型展开 Mesh、Skin/Cluster、AnimCurve、Pose、GlobalSettings、Texture、Video、DisplayLayer 等。

`connections[]`：`kind` 为 `OO` / `OP` / `PO` / `PP`，`src` / `dst` 是 SDK `GetUniqueID()`。

对照本库时注意：

- `uniqueId` 是 **SDK 运行时 ID**，不是文件 Objects 节点里的 UniqueId。应对 classId + name + 连接拓扑 + 几何/曲线数据。
- SDK 导入会做轴转换。`localTransform`、`Cluster.Transform`、`typed.axisSystem` 不作为对齐依据；Cluster 只对 `TransformLink`。
- SDK 会注入 `FbxAnimEvalClassic` / `FbxDocumentInfo`，本库不造。

## 生成测试 gold

把 dump JSON 收成测试用子集（跳过轴转换字段和运行时 uniqueId）：

```bash
pnpm exec tsx tools/fbx-dump/generate-gold.mts dump.sdk.json tests/fixtures/foo.gold.json
```
