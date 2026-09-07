import type { FbxNode } from '@infloopgame/lib-fbx'
import {
  countSubtree,
  displayName,
  isExpandedByDefault,
  nodeKind,
  type NodeKind,
} from './scene-tree-model'

export type SceneTreeHandle = {
  render(root: FbxNode | null): void
  select(node: FbxNode | null): void
}

type RowState = {
  node: FbxNode
  parent: FbxNode | null
  depth: number
  row: HTMLElement
  kids: HTMLElement | null
  twist: HTMLButtonElement
  expanded: boolean
}

const CHEVRON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 12 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`

export function mountSceneTree(
  host: HTMLElement,
  callbacks: { onSelect: (node: FbxNode) => void },
): SceneTreeHandle {
  host.replaceChildren()
  const head = document.createElement('header')
  const title = document.createElement('strong')
  title.textContent = '层级'
  const countEl = document.createElement('span')
  countEl.className = 'outliner-count'
  head.append(title, countEl)

  const tree = document.createElement('div')
  tree.className = 'outliner-tree'
  tree.role = 'tree'
  tree.tabIndex = 0
  tree.setAttribute('aria-label', '场景层级')

  host.append(head, tree)

  const rows = new Map<FbxNode, RowState>()
  let selected: FbxNode | null = null
  let rootNode: FbxNode | null = null

  const empty = (): void => {
    tree.replaceChildren()
    const p = document.createElement('p')
    p.className = 'tree-empty'
    p.textContent = '尚未加载'
    tree.append(p)
    countEl.textContent = ''
    rows.clear()
    selected = null
    rootNode = null
  }

  const applyExpanded = (state: RowState): void => {
    const hasKids = state.node.children.length > 0
    state.twist.classList.toggle('open', state.expanded && hasKids)
    state.twist.disabled = !hasKids
    if (hasKids) {
      state.row.setAttribute('aria-expanded', String(state.expanded))
      state.twist.setAttribute('aria-expanded', String(state.expanded))
      state.twist.setAttribute('aria-label', state.expanded ? '收起' : '展开')
      if (state.kids) state.kids.hidden = !state.expanded
    } else {
      state.row.removeAttribute('aria-expanded')
      state.twist.removeAttribute('aria-expanded')
      state.twist.setAttribute('aria-label', '无子节点')
    }
  }

  const paintSelected = (): void => {
    for (const state of rows.values()) {
      const on = state.node === selected
      state.row.classList.toggle('selected', on)
      state.row.setAttribute('aria-selected', String(on))
    }
  }

  const select = (node: FbxNode | null, notify: boolean): void => {
    selected = node
    paintSelected()
    if (node) {
      const state = rows.get(node)
      state?.row.scrollIntoView({ block: 'nearest' })
      if (notify) callbacks.onSelect(node)
    }
  }

  const toggle = (node: FbxNode): void => {
    const state = rows.get(node)
    if (!state || state.node.children.length === 0) return
    state.expanded = !state.expanded
    applyExpanded(state)
  }

  const visibleStates = (): RowState[] => {
    const out: RowState[] = []
    const walk = (node: FbxNode): void => {
      const state = rows.get(node)
      if (!state) return
      out.push(state)
      if (state.expanded) for (const child of node.children) walk(child)
    }
    if (rootNode) walk(rootNode)
    return out
  }

  const build = (node: FbxNode, parent: FbxNode | null, depth: number): HTMLElement => {
    const branch = document.createElement('div')
    branch.className = 'tree-branch'

    const row = document.createElement('div')
    row.className = 'tree-row'
    row.role = 'treeitem'
    row.tabIndex = -1
    row.style.setProperty('--depth', String(depth))

    const twist = document.createElement('button')
    twist.type = 'button'
    twist.className = 'tree-twist'
    twist.innerHTML = CHEVRON
    twist.addEventListener('click', (e) => {
      e.stopPropagation()
      toggle(node)
    })

    const kind: NodeKind = nodeKind(node)
    const badge = document.createElement('span')
    badge.className = 'tree-kind'
    badge.dataset.kind = kind
    badge.textContent = kind

    const name = document.createElement('span')
    name.className = 'tree-name'
    name.textContent = displayName(node)
    name.title = displayName(node)

    row.append(twist, badge, name)
    row.addEventListener('click', () => select(node, true))

    const hasKids = node.children.length > 0
    const kids = hasKids ? document.createElement('div') : null
    if (kids) {
      kids.className = 'tree-kids'
      kids.role = 'group'
    }

    const state: RowState = {
      node,
      parent,
      depth,
      row,
      kids,
      twist,
      expanded: isExpandedByDefault(depth),
    }
    rows.set(node, state)
    applyExpanded(state)

    branch.append(row)
    if (kids) {
      for (const child of node.children) kids.append(build(child, node, depth + 1))
      branch.append(kids)
    }
    return branch
  }

  tree.addEventListener('keydown', (e) => {
    if (!rootNode || rows.size === 0) return
    const list = visibleStates()
    const idx = selected ? list.findIndex((s) => s.node === selected) : -1
    const current = idx >= 0 ? list[idx] : undefined

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = e.key === 'ArrowDown' ? list[Math.min(list.length - 1, idx + 1)] : list[Math.max(0, idx < 0 ? 0 : idx - 1)]
      if (next) select(next.node, true)
      return
    }
    if (!current) return
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (current.node.children.length > 0 && !current.expanded) toggle(current.node)
      else if (current.node.children[0]) select(current.node.children[0], true)
      return
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (current.expanded && current.node.children.length > 0) toggle(current.node)
      else if (current.parent) select(current.parent, true)
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      select(current.node, true)
    }
  })

  empty()

  return {
    render(root) {
      if (!root) {
        empty()
        return
      }
      rows.clear()
      selected = null
      rootNode = root
      tree.replaceChildren(build(root, null, 0))
      countEl.textContent = String(countSubtree(root))
    },
    select(node) {
      select(node, false)
    },
  }
}
