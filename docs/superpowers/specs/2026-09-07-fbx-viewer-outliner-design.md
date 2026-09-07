# FBX Viewer Scene Outliner

## Goal

在 `tools/fbx-viewer` 右侧增加场景层级树（Outliner），展示 `FbxScene` 节点图。点击节点时在 3D 视图中高亮并对准该节点。

## Decisions

- 数据源：SDK 场景图（`FbxScene.rootNode` / `FbxNode.children`），不是 parse tree，也不是 Three.js 物体树。
- 布局：右侧固定 Outliner 面板，不并进左侧 HUD。
- 点击：选中 + `BoxHelper` 高亮 + 相机对准包围盒。
- 默认展开前两层，更深层级收起。
- 不引入 React / 树组件库；viewer 保持 vanilla TS + DOM。
- 不新增 npm 依赖。

## Out of scope

- Parse tree / Objects 调试视图
- 搜索过滤、显隐开关、属性编辑
- 多选、框选、右键菜单

## UI

左侧 HUD 不动。右侧增加 `#outliner` 面板，视觉对齐现有 HUD：

- 宽约 280px，`position: fixed; top/right/bottom` 留 12px 边距
- 背景 `#1a1d24ee`，圆角 10px，可独立滚动
- 标题「层级」+ 节点计数
- 空状态：「尚未加载」
- 窄屏叠在画布上，不挡左侧控件

每行：

1. 展开/收起箭头（无子节点时占位，避免错位）
2. 类型标签：由 `nodeAttributes[0].classId` 映射为 Mesh / Bone / Null / Camera / Light；无 attribute 显示 Node
3. 节点名（空名用 `(unnamed)`）

交互：

- 点箭头：只切换展开，不改变选中
- 点行：选中该节点；已展开状态保持
- 键盘：树容器可聚焦；↑↓ 移动选中，←→ 收起/展开，Enter 对准 3D（与点击相同）
- 选中行用背景色区分，不只靠颜色：同时加左侧指示条

## Data flow

```
parse → buildScene(FbxScene)
      → fbxSceneToThree(scene)  // 已有 attachments: { node, obj }[]
      → ConvertResult.nodeMap: Map<FbxNode, Object3D>
      → renderTree(scene.rootNode)
```

改动：`fbxSceneToThree` 把内部 `attachments` 导出为 `nodeMap`（RootNode 映射到 `ConvertResult.root`）。`main.ts` 在 `loadBytes` 成功后刷新树，失败或 `clear()` 时清空选中与 helper。

## 3D selection

- 选中：给对应 `Object3D` 挂 `BoxHelper`（颜色与 HUD 主色一致，如 `#2d6cdf`），加入 scene，resize 时随物体更新。
- 对准：对有几何的物体用 `Box3.setFromObject` + 现有 `fit` 同类逻辑，缩放到该节点；对空 Group / Bone（包围盒为空或退化）用世界坐标为中心、半径取父级或场景尺度的一小段（例如当前场景 radius 的 5%，下限 1）。
- 换文件：`clear()` 移除 helper 与 `nodeMap` 引用。

## Files

| File | Change |
|------|--------|
| `tools/fbx-viewer/src/fbx-to-three.ts` | `ConvertResult` 增加 `nodeMap: Map<FbxNode, Object3D>` |
| `tools/fbx-viewer/src/scene-tree.ts` | 纯 DOM 树：render / select / expand；不碰 Three |
| `tools/fbx-viewer/src/main.ts` | 挂载面板、接线选中 → helper + 相机 |
| `tools/fbx-viewer/index.html` | `#outliner` 容器 |
| `tools/fbx-viewer/src/style.css` | 面板与树行样式 |
| `tools/fbx-viewer/README.md` | 一句说明右侧层级树 |

## Error / edge cases

- 未加载：空状态，无 helper
- 解析失败：树回到空状态（与 stat 失败文案一致）
- 同名节点：用 `FbxNode` 对象引用区分，不用名字当 key
- 无 `nodeAttributes`：标签为 Node
- 超深骨骼：虚拟化不做（YAGNI）；CSS 滚动即可。若单文件节点数极大，仍一次性渲染 DOM。

## Testing

viewer 无单测基建。验收：

1. 打开 `pnpm viewer`，未加载时右侧显示空状态
2. 拖入含 Mesh + 骨骼的 FBX：树与 `stat` 的 nodes 数量一致（RootNode 子树计数）
3. 展开/收起不改变相机
4. 点 Mesh 节点：出现 BoxHelper，相机对准该网格
5. 点 Bone 节点：相机移到骨骼附近，不崩
6. 再加载另一个文件：旧 helper 消失，树换成新文件

## Success

加载 FBX 后能在右侧看清节点层级，点任一节点能在 3D 里找到对应物体。
