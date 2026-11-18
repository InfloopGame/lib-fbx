import type { Object3D } from 'three'
import type { FbxNode, FbxPropertyData } from '@infloopgame/lib-fbx'
import { FbxPropertyFlags } from '@infloopgame/lib-fbx'
import { iconForKind, iconSvg } from './scene-tree-icons'
import {
  displayName,
  fbxTypeLabel,
  nodeKind,
  parseUdpEntries,
  unescapeFbxText,
  userProperties,
  type NodeKind,
} from './scene-tree-model'

export type SceneTreeHandle = {
  render(root: FbxNode | null): void
  select(node: FbxNode | null): void
  setExpanded(open: boolean): void
}

type RowState = {
  node: FbxNode
  parent: FbxNode | null
  depth: number
  kind: NodeKind
  row: HTMLElement
  nameEl: HTMLElement
  typeEl: HTMLElement
  kids: HTMLElement | null
  twist: HTMLButtonElement | null
  eye: HTMLButtonElement
  expanded: boolean
}

type PropLine = { label: string; value: string; mono?: boolean; title?: string; wrap?: boolean }

export function mountSceneTree(
  hosts: {
    hierarchy: HTMLElement
    inspector: HTMLElement
    searchInput: HTMLInputElement
    searchCount: HTMLElement
    searchPrev: HTMLButtonElement
    searchNext: HTMLButtonElement
  },
  callbacks: {
    onSelect: (node: FbxNode | null) => void
    objectFor?: (node: FbxNode) => Object3D | null
  },
): SceneTreeHandle {
  const hierarchy = hosts.hierarchy
  const inspector = hosts.inspector
  const searchInput = hosts.searchInput
  const matchCount = hosts.searchCount
  const prevBtn = hosts.searchPrev
  const nextBtn = hosts.searchNext
  hierarchy.replaceChildren()
  inspector.replaceChildren()
  hierarchy.classList.add('hier')

  const tree = document.createElement('div')
  tree.className = 'hier-tree'
  tree.role = 'tree'
  tree.tabIndex = 0
  tree.setAttribute('aria-label', 'Hierarchy')
  hierarchy.append(tree)

  const rows = new Map<FbxNode, RowState>()
  const foldOpen = new Map<string, boolean>([
    ['node', true],
    ['transform', true],
    ['user', true],
  ])
  let selected: FbxNode | null = null
  let rootNode: FbxNode | null = null
  let searchText = ''
  let matched: FbxNode[] = []
  let matchIndex = -1

  const objectFor = (node: FbxNode): Object3D | null => callbacks.objectFor?.(node) ?? null

  const empty = (): void => {
    tree.replaceChildren()
    const p = document.createElement('p')
    p.className = 'hier-empty'
    p.textContent = '尚未加载'
    tree.append(p)
    rows.clear()
    selected = null
    rootNode = null
    searchText = ''
    searchInput.value = ''
    matched = []
    matchIndex = -1
    paintMatchChrome()
    paintInspector()
  }

  const applyExpanded = (state: RowState): void => {
    const hasKids = state.node.children.length > 0
    if (state.twist) {
      state.twist.innerHTML = iconSvg(state.expanded ? 'chevron-down' : 'chevron-right', 12, 2)
      state.twist.setAttribute('aria-expanded', String(state.expanded))
      state.twist.setAttribute('aria-label', state.expanded ? '收起' : '展开')
    }
    if (hasKids) state.row.setAttribute('aria-expanded', String(state.expanded))
    else state.row.removeAttribute('aria-expanded')
    if (state.kids) state.kids.hidden = !state.expanded
  }

  const paintEye = (state: RowState): void => {
    const on = isVisible(state.node, objectFor(state.node))
    state.row.classList.toggle('is-hidden', !on)
    state.eye.innerHTML = iconSvg(on ? 'eye' : 'eye-off', 12, 1.6)
    state.eye.title = on ? '隐藏节点' : '显示节点'
    state.eye.setAttribute('aria-label', state.eye.title)
  }

  const paintSelected = (): void => {
    for (const state of rows.values()) {
      const on = state.node === selected
      state.row.classList.toggle('is-selected', on)
      state.row.setAttribute('aria-selected', String(on))
    }
    paintMatches()
  }

  const paintInspector = (): void => {
    inspector.replaceChildren()
    if (!selected) {
      const emptyEl = document.createElement('p')
      emptyEl.className = 'insp-empty'
      emptyEl.textContent = '未选择对象'
      inspector.append(emptyEl)
      return
    }
    const kind = nodeKind(selected)
    const nodeFold = foldout(fbxTypeLabel(selected), 'node', foldOpen, paintInspector)
    const nodeIcon = document.createElement('span')
    nodeIcon.className = 'foldout-icon hier-icon'
    nodeIcon.dataset.kind = kind
    nodeIcon.innerHTML = iconSvg(iconForKind(kind), 12, 1.6)
    nodeFold.bar.insertBefore(nodeIcon, nodeFold.title)
    nodeFold.body.append(
      field('名称', textInput(displayName(selected))),
      field('类型', textInput(fbxTypeLabel(selected))),
      field('可见', textInput(isVisible(selected, objectFor(selected)) ? '是' : '否', 'Visibility')),
    )
    const mats = selected.materials.map((m) => m.name).filter(Boolean)
    if (mats.length > 0) nodeFold.body.append(field('材质', textInput(mats.join(', '))))
    if (selected.uniqueId) nodeFold.body.append(field('ID', textInput(String(selected.uniqueId), undefined, true)))
    inspector.append(nodeFold.root)

    const xform = foldout('Transform', 'transform', foldOpen, paintInspector)
    xform.body.append(
      field('Position', vec3Input(vecParts(selected.lclTranslation?.value)), 'Lcl Translation'),
      field('Rotation', vec3Input(vecParts(selected.lclRotation?.value)), 'Lcl Rotation'),
      field('Scale', vec3Input(vecParts(selected.lclScaling?.value)), 'Lcl Scaling'),
    )
    inspector.append(xform.root)

    const user = foldout('用户属性', 'user', foldOpen, paintInspector)
    const users = userPropLines(selected)
    if (users.length === 0) {
      const note = document.createElement('p')
      note.className = 'foldout-note'
      note.textContent = '无'
      user.body.append(note)
    } else {
      for (const line of users) user.body.append(field(line.label, line.wrap ? areaInput(line.value, line.title) : textInput(line.value, line.title, line.mono), line.title))
    }
    inspector.append(user.root)
  }

  const selectNode = (node: FbxNode | null, notify: boolean): void => {
    selected = node
    paintSelected()
    paintInspector()
    if (node) rows.get(node)?.row.scrollIntoView({ block: 'nearest' })
    if (notify) callbacks.onSelect(node)
  }

  const toggle = (node: FbxNode): void => {
    const state = rows.get(node)
    if (!state || state.node.children.length === 0) return
    state.expanded = !state.expanded
    applyExpanded(state)
  }

  const reveal = (node: FbxNode): void => {
    let parent = rows.get(node)?.parent ?? null
    while (parent) {
      const state = rows.get(parent)
      if (state && !state.expanded) {
        state.expanded = true
        applyExpanded(state)
      }
      parent = state?.parent ?? null
    }
    selectNode(node, true)
  }

  const recomputeMatches = (): void => {
    const q = searchText.trim().toLowerCase()
    matched = []
    if (q && rootNode) {
      const walk = (node: FbxNode): void => {
        const state = rows.get(node)
        const users = userPropLines(node)
          .map((line) => `${line.label} ${line.value}`)
          .join(' ')
        const hay = `${displayName(node)} ${fbxTypeLabel(node)} ${state?.kind ?? nodeKind(node)} ${users} ${node.uniqueId}`.toLowerCase()
        if (hay.includes(q)) matched.push(node)
        for (const child of node.children) walk(child)
      }
      walk(rootNode)
    }
    if (matched.length === 0) matchIndex = -1
    else if (matchIndex < 0) matchIndex = 0
    else matchIndex = Math.min(matchIndex, matched.length - 1)
    paintMatchChrome()
    paintMatches()
  }

  const jumpMatch = (step: -1 | 1): void => {
    if (matched.length === 0) return
    const base = matchIndex < 0 ? (step > 0 ? -1 : 0) : matchIndex
    matchIndex = (base + step + matched.length) % matched.length
    paintMatchChrome()
    paintMatches()
    const target = matched[matchIndex]
    if (target) reveal(target)
  }

  const paintMatchChrome = (): void => {
    const none = matched.length === 0
    matchCount.textContent = none ? '0/0' : `${matchIndex + 1}/${matched.length}`
    prevBtn.disabled = none
    nextBtn.disabled = none
  }

  const paintMatches = (): void => {
    const q = searchText.trim()
    const active = matchIndex >= 0 ? matched[matchIndex] : null
    const set = new Set(matched)
    for (const state of rows.values()) {
      fillHighlight(state.nameEl, displayName(state.node), q)
      fillHighlight(state.typeEl, fbxTypeLabel(state.node), q)
      const isMatch = set.has(state.node)
      const isActive = state.node === active
      state.row.classList.toggle('is-match', isMatch && state.node !== selected)
      state.row.classList.toggle('is-active', isActive && state.node !== selected)
    }
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
    const kind = nodeKind(node)
    const branch = document.createElement('div')
    branch.className = 'hier-branch'

    const row = document.createElement('div')
    row.className = 'hier-row'
    row.role = 'treeitem'
    row.tabIndex = -1
    row.style.paddingLeft = `${2 + depth * 14}px`
    const typeName = fbxTypeLabel(node)
    row.title = `${typeName} · ${node.uniqueId || displayName(node)}`

    const hasKids = node.children.length > 0
    let twist: HTMLButtonElement | null = null
    if (hasKids) {
      twist = document.createElement('button')
      twist.type = 'button'
      twist.className = 'hier-twist'
      twist.addEventListener('click', (e) => {
        e.stopPropagation()
        toggle(node)
      })
      row.append(twist)
    } else {
      const spacer = document.createElement('span')
      spacer.className = 'hier-twist-gap'
      row.append(spacer)
    }

    const badge = document.createElement('span')
    badge.className = 'hier-icon'
    badge.dataset.kind = kind
    badge.innerHTML = iconSvg(iconForKind(kind), 13, 1.6)

    const label = document.createElement('span')
    label.className = 'hier-label'
    const nameEl = document.createElement('span')
    nameEl.className = 'hier-name'
    const typeEl = document.createElement('span')
    typeEl.className = 'hier-type'
    label.append(nameEl, typeEl)

    const eye = document.createElement('button')
    eye.type = 'button'
    eye.className = 'hier-eye'
    eye.addEventListener('click', (e) => {
      e.stopPropagation()
      const obj = objectFor(node)
      if (!obj) return
      obj.visible = !obj.visible
      paintEye(rows.get(node)!)
      if (selected === node) paintInspector()
    })

    row.append(badge, label, eye)
    row.addEventListener('click', () => {
      tree.focus()
      selectNode(selected === node ? null : node, true)
    })

    const kids = hasKids ? document.createElement('div') : null
    if (kids) kids.role = 'group'

    const state: RowState = {
      node,
      parent,
      depth,
      kind,
      row,
      nameEl,
      typeEl,
      kids,
      twist,
      eye,
      expanded: true,
    }
    rows.set(node, state)
    applyExpanded(state)
    paintEye(state)
    fillHighlight(nameEl, displayName(node), '')
    fillHighlight(typeEl, typeName, '')

    branch.append(row)
    if (kids) {
      for (const child of node.children) kids.append(build(child, node, depth + 1))
      branch.append(kids)
    }
    return branch
  }

  searchInput.addEventListener('input', () => {
    searchText = searchInput.value
    matchIndex = -1
    recomputeMatches()
    const target = matchIndex >= 0 ? matched[matchIndex] : undefined
    if (target) reveal(target)
  })
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      jumpMatch(e.shiftKey ? -1 : 1)
    }
  })
  prevBtn.addEventListener('click', () => jumpMatch(-1))
  nextBtn.addEventListener('click', () => jumpMatch(1))

  tree.addEventListener('keydown', (e) => {
    if (!rootNode || rows.size === 0) return
    const list = visibleStates()
    const idx = selected ? list.findIndex((s) => s.node === selected) : -1
    const current = idx >= 0 ? list[idx] : undefined

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next =
        e.key === 'ArrowDown' ? list[Math.min(list.length - 1, idx + 1)] : list[Math.max(0, idx < 0 ? 0 : idx - 1)]
      if (next) selectNode(next.node, true)
      return
    }
    if (!current) return
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (current.node.children.length > 0 && !current.expanded) toggle(current.node)
      else if (current.node.children[0]) selectNode(current.node.children[0], true)
      return
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (current.expanded && current.node.children.length > 0) toggle(current.node)
      else if (current.parent) selectNode(current.parent, true)
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      selectNode(current.node, true)
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
      const inner = document.createElement('div')
      inner.className = 'hier-inner'
      inner.append(build(root, null, 0))
      tree.replaceChildren(inner)
      searchInput.value = ''
      searchText = ''
      matchIndex = -1
      recomputeMatches()
      paintInspector()
    },
    select(node) {
      if (!node) {
        selectNode(null, true)
        return
      }
      if (!rows.has(node)) return
      reveal(node)
    },
    setExpanded(open) {
      for (const state of rows.values()) {
        if (state.node.children.length === 0) continue
        state.expanded = open
        applyExpanded(state)
      }
    },
  }
}

function fillHighlight(el: HTMLElement, text: string, keyword: string): void {
  el.replaceChildren()
  const q = keyword.trim()
  const idx = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (!q || idx < 0) {
    el.textContent = text
    return
  }
  el.append(document.createTextNode(text.slice(0, idx)))
  const hit = document.createElement('span')
  hit.className = 'hier-hit'
  hit.textContent = text.slice(idx, idx + q.length)
  el.append(hit, document.createTextNode(text.slice(idx + q.length)))
}

function isVisible(node: FbxNode, obj: Object3D | null): boolean {
  if (obj) return obj.visible
  const vis = node.visibility?.value
  return typeof vis === 'number' ? vis > 1e-6 : true
}

function userPropLines(node: FbxNode): PropLine[] {
  const users = userProperties(node)
  const lines: PropLine[] = []
  for (const prop of users) {
    const hidden = (prop.flags & FbxPropertyFlags.eHidden) !== 0
    if (prop.name.toLowerCase() === 'udp3dsmax' && typeof prop.value === 'string') {
      const entries = parseUdpEntries(prop.value)
      if (entries && entries.length > 0) {
        for (const entry of entries) {
          lines.push({
            label: entry.name,
            value: entry.value || '—',
            wrap: true,
            title: hidden ? 'UDP3DSMAX（隐藏）' : 'UDP3DSMAX',
          })
        }
        continue
      }
      lines.push({
        label: prop.name,
        value: unescapeFbxText(prop.value) || '—',
        wrap: true,
        title: hidden ? 'UDP3DSMAX（隐藏）' : 'UDP3DSMAX',
      })
      continue
    }
    lines.push({
      label: prop.name,
      value: fmtPropValue(prop.value),
      mono: typeof prop.value !== 'string',
      wrap: typeof prop.value === 'string' && prop.value.includes('\n'),
      title: hidden ? `${prop.name}（隐藏）` : prop.name,
    })
  }
  return lines
}

function foldout(
  title: string,
  key: string,
  openMap: Map<string, boolean>,
  repaint: () => void,
): { root: HTMLElement; bar: HTMLButtonElement; title: HTMLElement; body: HTMLElement } {
  const open = openMap.get(key) !== false
  const root = document.createElement('section')
  root.className = 'foldout'
  const bar = document.createElement('button')
  bar.type = 'button'
  bar.className = 'foldout-bar'
  bar.setAttribute('aria-expanded', String(open))
  const mark = document.createElement('span')
  mark.className = 'foldout-mark'
  mark.innerHTML = iconSvg(open ? 'chevron-down' : 'chevron-right', 10, 2.4)
  const titleEl = document.createElement('span')
  titleEl.className = 'foldout-title'
  titleEl.textContent = title
  bar.append(mark, titleEl)
  const body = document.createElement('div')
  body.className = 'foldout-body'
  body.hidden = !open
  bar.addEventListener('click', () => {
    const next = Boolean(body.hidden)
    openMap.set(key, next)
    repaint()
  })
  root.append(bar, body)
  return { root, bar, title: titleEl, body }
}

function field(labelText: string, control: HTMLElement, title?: string): HTMLElement {
  const row = document.createElement('div')
  row.className = control.classList.contains('field-area') ? 'field is-top' : 'field'
  const label = document.createElement('span')
  label.className = 'field-label'
  label.textContent = labelText
  if (title) {
    label.title = title
    row.title = title
  }
  row.append(label, control)
  return row
}

function textInput(value: string, title?: string, mono = false): HTMLInputElement {
  const input = document.createElement('input')
  input.className = mono ? 'field-input is-mono' : 'field-input'
  input.readOnly = true
  input.value = value
  input.title = title ?? value
  return input
}

function areaInput(value: string, title?: string): HTMLTextAreaElement {
  const el = document.createElement('textarea')
  el.className = 'field-input field-area'
  el.readOnly = true
  el.value = value
  el.rows = Math.min(6, Math.max(2, value.split('\n').length))
  el.title = title ?? value
  return el
}

function vec3Input(parts: [string, string, string]): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'vec3'
  const tags = [
    ['X', 'axis-x'],
    ['Y', 'axis-y'],
    ['Z', 'axis-z'],
  ] as const
  parts.forEach((value, i) => {
    const tag = tags[i]
    if (!tag) return
    const cell = document.createElement('label')
    cell.className = 'axis'
    const mark = document.createElement('span')
    mark.className = `axis-tag ${tag[1]}`
    mark.textContent = tag[0]
    const input = textInput(value, undefined, true)
    cell.append(mark, input)
    wrap.append(cell)
  })
  return wrap
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(3)
}

function vecParts(v: readonly number[] | undefined): [string, string, string] {
  if (!v || v.length < 3) return ['—', '—', '—']
  return [fmtNum(Number(v[0])), fmtNum(Number(v[1])), fmtNum(Number(v[2]))]
}

function fmtPropValue(value: FbxPropertyData): string {
  if (value == null) return '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return fmtNum(value)
  if (typeof value === 'string') return value || '—'
  if (value instanceof ArrayBuffer) return `${value.byteLength} bytes`
  if (ArrayBuffer.isView(value)) return fmtList(Array.from(value as unknown as ArrayLike<number>))
  if (Array.isArray(value)) return fmtList(value.map((n) => Number(n)))
  if (typeof value === 'object' && 'ticks' in value) return String(value.ticks)
  return String(value)
}

function fmtList(values: number[]): string {
  const shown = values.slice(0, 8).map((n) => fmtNum(n))
  return values.length > 8 ? `${shown.join('  ')} … (${values.length})` : shown.join('  ')
}
