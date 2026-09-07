# FBX Viewer Outliner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `tools/fbx-viewer` 右侧显示 `FbxScene` 节点树，点击节点时用 BoxHelper 高亮并对准 3D。

**Architecture:** 纯函数（类型标签 / 显示名 / 默认展开 / 计数）与 DOM 树分离。`fbxSceneToThree` 导出 `nodeMap`。`main.ts` 把选中接到 helper 与相机。

**Tech Stack:** vanilla TypeScript、DOM、three.js、vitest。不新增依赖。

## Global Constraints

- 数据源只有 `FbxScene.rootNode`，不要 parse tree
- 默认展开 depth `< 2`（RootNode 与其直接子节点）
- 点箭头只展开；点行才选中并对准
- 空名显示 `(unnamed)`
- 不引入树组件库 / React
- 不提交（除非用户再要求）

---

### Task 1: Scene tree model

**Files:**
- Create: `tools/fbx-viewer/src/scene-tree-model.ts`
- Test: `tests/viewer-scene-tree.test.ts`
- Modify: `tsconfig.test.json`（include `tools/fbx-viewer/src/scene-tree-model.ts`）

**Produces:**
- `nodeKind(node: FbxNode): 'Mesh' | 'Bone' | 'Null' | 'Camera' | 'Light' | 'Node'`
- `displayName(node: FbxNode): string`
- `isExpandedByDefault(depth: number): boolean`
- `countSubtree(node: FbxNode): number`

- [ ] 写失败测试（stub `FbxNode`，断言 kind / 空名 / depth / 计数）
- [ ] `pnpm test tests/viewer-scene-tree.test.ts` 应失败
- [ ] 实现 `scene-tree-model.ts`
- [ ] 测试通过

---

### Task 2: Export nodeMap

**Files:**
- Modify: `tools/fbx-viewer/src/fbx-to-three.ts`（`ConvertResult` 与 `fbxSceneToThree` return）

**Produces:** `ConvertResult.nodeMap: Map<FbxNode, Object3D>`，含 `scene.rootNode → root` 以及每个 walked node。

- [ ] `ConvertResult` 增加 `nodeMap`
- [ ] return 时 `new Map(attachments.map(...)); nodeMap.set(scene.rootNode, root)`

---

### Task 3: DOM tree + wiring

**Files:**
- Create: `tools/fbx-viewer/src/scene-tree.ts`
- Modify: `tools/fbx-viewer/index.html`、`style.css`、`main.ts`、`README.md`
- Modify: `package.json` typecheck 增加 `-p tools/fbx-viewer/tsconfig.json`

**Produces:** `mountSceneTree(host, { onSelect })` → `{ render(root | null), select(node | null) }`

行为：空状态「尚未加载」；箭头 vs 行点击分离；↑↓←→Enter；选中行 `aria-selected` + 左侧指示条。`main.ts` 用 BoxHelper + 对准包围盒（空盒用世界坐标 + 场景半径 5%）。

- [ ] 实现 DOM 树与样式
- [ ] `loadBytes` / `clear` 刷新树
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm viewer` 手工验收 spec 中的 6 条
