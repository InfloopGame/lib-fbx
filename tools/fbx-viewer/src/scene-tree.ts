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

type PropLine = { label: string; value: string; mono?: boolean; title?: string; wrap?: boolean; section?: boolean }

export function mountSceneTree(
  host: HTMLElement,
  callbacks: {
    onSelect: (node: FbxNode | null) => void
    objectFor?: (node: FbxNode) => Object3D | null
    onHide?: () => void
  },
): SceneTreeHandle {
  host.replaceChildren()
  host.classList.add('scene-outliner')

  const header = document.createElement('div')
  header.className = 'scene-outliner-header'
  header.innerHTML = `<div class="scene-outliner-title-row"><span class="scene-outliner-title-icon">${iconSvg('layers', 14, 1.8)}</span><span class="scene-outliner-title">场景大纲</span></div>`
  const hideBtn = document.createElement('button')
  hideBtn.type = 'button'
  hideBtn.className = 'scene-outliner-hide'
  hideBtn.title = '隐藏大纲'
  hideBtn.setAttribute('aria-label', '隐藏大纲')
  hideBtn.innerHTML = iconSvg('chevron-right', 14, 2)
  hideBtn.addEventListener('click', () => callbacks.onHide?.())
  header.querySelector('.scene-outliner-title-row')?.append(hideBtn)

  const searchRow = document.createElement('div')
  searchRow.className = 'scene-outliner-search-row'
  const searchBox = document.createElement('div')
  searchBox.className = 'scene-outliner-search-box'
  searchBox.innerHTML = iconSvg('search', 13, 1.8).replace('<svg ', '<svg class="scene-outliner-search-icon" ')
  const searchInput = document.createElement('input')
  searchInput.type = 'text'
  searchInput.className = 'scene-outliner-search-input'
  searchInput.placeholder = '搜索名称 / 类型 / ID'
  searchInput.setAttribute('aria-label', '搜索场景节点')
  searchBox.append(searchInput)
  const matchCount = document.createElement('span')
  matchCount.className = 'scene-outliner-match-count'
  matchCount.textContent = '0/0'
  const prevBtn = matchButton('arrow-up', '上一个匹配')
  const nextBtn = matchButton('arrow-down', '下一个匹配')
  searchRow.append(searchBox, matchCount, prevBtn, nextBtn)
  header.append(searchRow)

  const tree = document.createElement('div')
  tree.className = 'scene-outliner-tree'
  tree.role = 'tree'
  tree.tabIndex = 0
  tree.setAttribute('aria-label', '场景大纲')

  const props = document.createElement('div')
  props.className = 'scene-outliner-props'
  const propsToggle = document.createElement('button')
  propsToggle.type = 'button'
  propsToggle.className = 'scene-outliner-props-toggle'
  const propsChevron = document.createElement('span')
  propsChevron.className = 'scene-outliner-props-chevron'
  propsChevron.innerHTML = iconSvg('chevron-down', 13, 2)
  const propsIcon = document.createElement('span')
  propsIcon.className = 'scene-outliner-props-icon'
  propsIcon.innerHTML = iconSvg('info', 13, 1.8)
  const propsTitle = document.createElement('span')
  propsTitle.className = 'scene-outliner-props-title'
  propsTitle.textContent = '属性'
  const propsType = document.createElement('span')
  propsType.className = 'scene-outliner-props-type'
  propsToggle.append(propsChevron, propsIcon, propsTitle, propsType)
  const propsBody = document.createElement('div')
  propsBody.className = 'scene-outliner-props-body'
  props.append(propsToggle, propsBody)

  host.append(header, tree, props)

  const rows = new Map<FbxNode, RowState>()
  let selected: FbxNode | null = null
  let rootNode: FbxNode | null = null
  let propsOpen = true
  let searchText = ''
  let matched: FbxNode[] = []
  let matchIndex = -1

  const objectFor = (node: FbxNode): Object3D | null => callbacks.objectFor?.(node) ?? null

  const empty = (): void => {
    tree.replaceChildren()
    const p = document.createElement('p')
    p.className = 'scene-outliner-tree-empty'
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
    paintProps()
  }

  const applyExpanded = (state: RowState): void => {
    const hasKids = state.node.children.length > 0
    if (state.twist) {
      state.twist.innerHTML = iconSvg(state.expanded ? 'chevron-down' : 'chevron-right', 14, 2)
      state.twist.setAttribute('aria-expanded', String(state.expanded))
      state.twist.setAttribute('aria-label', state.expanded ? '收起' : '展开')
    }
    if (hasKids) state.row.setAttribute('aria-expanded', String(state.expanded))
    else state.row.removeAttribute('aria-expanded')
    if (state.kids) state.kids.hidden = !state.expanded
  }

  const paintEye = (state: RowState): void => {
    const on = isVisible(state.node, objectFor(state.node))
    state.row.classList.toggle('scene-outliner-row-hidden', !on)
    state.eye.innerHTML = iconSvg(on ? 'eye' : 'eye-off', 14, 1.6)
    state.eye.title = on ? '隐藏节点' : '显示节点'
    state.eye.setAttribute('aria-label', state.eye.title)
  }

  const paintSelected = (): void => {
    for (const state of rows.values()) {
      const on = state.node === selected
      state.row.classList.toggle('scene-outliner-row-selected', on)
      state.row.setAttribute('aria-selected', String(on))
    }
    paintMatches()
  }

  const paintProps = (): void => {
    propsChevron.classList.toggle('scene-outliner-props-chevron-closed', !propsOpen)
    propsBody.hidden = !propsOpen
    propsType.replaceChildren()
    propsBody.replaceChildren()
    if (!selected) {
      const emptyEl = document.createElement('div')
      emptyEl.className = 'scene-outliner-props-empty'
      emptyEl.textContent = '点击节点查看属性'
      propsBody.append(emptyEl)
      return
    }
    const kind = nodeKind(selected)
    const icon = document.createElement('span')
    icon.className = 'scene-outliner-node-icon'
    icon.dataset.kind = kind
    icon.innerHTML = iconSvg(iconForKind(kind), 13, 1.6)
    const typeLabel = document.createElement('span')
    typeLabel.textContent = fbxTypeLabel(selected)
    propsType.append(icon, typeLabel)
    for (const line of nodeProps(selected)) propsBody.append(propRow(line))
  }

  const select = (node: FbxNode | null, notify: boolean): void => {
    selected = node
    paintSelected()
    paintProps()
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
    select(node, true)
  }

  const recomputeMatches = (): void => {
    const q = searchText.trim().toLowerCase()
    matched = []
    if (q && rootNode) {
      const walk = (node: FbxNode): void => {
        const state = rows.get(node)
        const users = userPropLines(node).map((line) => `${line.label} ${line.value}`).join(' ')
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
      state.row.classList.toggle('scene-outliner-row-active-match', isActive && state.node !== selected)
      let bar = state.row.querySelector<HTMLElement>('.scene-outliner-match-bar')
      if (isMatch && state.node !== selected) {
        if (!bar) {
          bar = document.createElement('span')
          bar.className = 'scene-outliner-match-bar'
          bar.setAttribute('aria-hidden', 'true')
          state.row.prepend(bar)
        }
        bar.classList.toggle('scene-outliner-match-bar-active', isActive)
      } else {
        bar?.remove()
      }
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
    branch.className = 'scene-outliner-node'

    const row = document.createElement('div')
    row.className = 'scene-outliner-row'
    row.role = 'treeitem'
    row.tabIndex = -1
    row.style.paddingLeft = `${4 + depth * 16}px`
    const typeName = fbxTypeLabel(node)
    row.title = `${typeName} · ${node.uniqueId || displayName(node)}`

    const hasKids = node.children.length > 0
    let twist: HTMLButtonElement | null = null
    if (hasKids) {
      twist = document.createElement('button')
      twist.type = 'button'
      twist.className = 'scene-outliner-expand-btn'
      twist.addEventListener('click', (e) => {
        e.stopPropagation()
        toggle(node)
      })
      row.append(twist)
    } else {
      const spacer = document.createElement('span')
      spacer.className = 'scene-outliner-expand-spacer'
      row.append(spacer)
    }

    const badge = document.createElement('span')
    badge.className = 'scene-outliner-node-icon'
    badge.dataset.kind = kind
    badge.innerHTML = iconSvg(iconForKind(kind), 15, 1.6)

    const label = document.createElement('span')
    label.className = 'scene-outliner-node-label'
    const nameEl = document.createElement('span')
    nameEl.className = 'scene-outliner-node-name'
    const typeEl = document.createElement('span')
    typeEl.className = 'scene-outliner-node-type'
    label.append(nameEl, typeEl)

    const eye = document.createElement('button')
    eye.type = 'button'
    eye.className = 'scene-outliner-visibility-btn'
    eye.addEventListener('click', (e) => {
      e.stopPropagation()
      const obj = objectFor(node)
      if (!obj) return
      obj.visible = !obj.visible
      paintEye(rows.get(node)!)
      if (selected === node) paintProps()
    })

    row.append(badge, label, eye)
    row.addEventListener('click', () => {
      tree.focus()
      select(selected === node ? null : node, true)
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
  propsToggle.addEventListener('click', () => {
    propsOpen = !propsOpen
    paintProps()
  })

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
      const inner = document.createElement('div')
      inner.className = 'scene-outliner-tree-inner'
      inner.append(build(root, null, 0))
      tree.replaceChildren(inner)
      searchInput.value = ''
      searchText = ''
      matchIndex = -1
      recomputeMatches()
      paintProps()
    },
    select(node) {
      if (node && !rows.has(node)) return
      select(node, false)
    },
  }
}

function matchButton(name: 'arrow-up' | 'arrow-down', label: string): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'scene-outliner-match-btn'
  btn.title = label
  btn.setAttribute('aria-label', label)
  btn.innerHTML = iconSvg(name, 13, 1.8)
  return btn
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
  hit.className = 'scene-outliner-highlight'
  hit.textContent = text.slice(idx, idx + q.length)
  el.append(hit, document.createTextNode(text.slice(idx + q.length)))
}

function isVisible(node: FbxNode, obj: Object3D | null): boolean {
  if (obj) return obj.visible
  const vis = node.visibility?.value
  return typeof vis === 'number' ? vis > 1e-6 : true
}

function nodeProps(node: FbxNode): PropLine[] {
  const lines: PropLine[] = [
    { label: '名称', value: displayName(node) },
    { label: '类型', value: fbxTypeLabel(node) },
    { label: '平移', value: fmtLcl(node.lclTranslation?.value), mono: true, title: 'Lcl Translation' },
    { label: '旋转', value: fmtLcl(node.lclRotation?.value), mono: true, title: 'Lcl Rotation' },
    { label: '缩放', value: fmtLcl(node.lclScaling?.value), mono: true, title: 'Lcl Scaling' },
    { label: '可见', value: isVisible(node, null) ? '是' : '否', title: 'Visibility' },
  ]
  const mats = node.materials.map((m) => m.name).filter(Boolean)
  if (mats.length > 0) lines.push({ label: '材质', value: mats.join(', ') })
  if (node.uniqueId) lines.push({ label: 'ID', value: String(node.uniqueId), mono: true })
  lines.push(...userPropLines(node))
  return lines
}

function userPropLines(node: FbxNode): PropLine[] {
  const users = userProperties(node)
  if (users.length === 0) return [{ label: '用户属性', value: '无' }]
  const lines: PropLine[] = [{ label: '用户属性', value: '', section: true }]
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
      wrap: true,
      title: hidden ? `${prop.name}（隐藏）` : prop.name,
    })
  }
  return lines
}

function propRow(line: PropLine): HTMLElement {
  const row = document.createElement('div')
  if (line.section) {
    row.className = 'scene-outliner-prop-section'
    row.textContent = line.label
    return row
  }
  row.className = line.wrap ? 'scene-outliner-prop-row scene-outliner-prop-row-wrap' : 'scene-outliner-prop-row'
  const label = document.createElement('span')
  label.className = 'scene-outliner-prop-label'
  label.textContent = line.label
  const value = document.createElement('span')
  value.className = line.mono ? 'scene-outliner-prop-value scene-outliner-prop-value-mono' : 'scene-outliner-prop-value'
  value.textContent = line.value
  value.title = line.title ?? line.value
  if (line.title) label.title = line.title
  row.append(label, value)
  return row
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(3)
}

function fmtVec(x: number, y: number, z: number): string {
  return [x, y, z].map(fmtNum).join('  ')
}

function fmtLcl(v: readonly number[] | undefined): string {
  if (!v || v.length < 3) return '—'
  return fmtVec(Number(v[0]), Number(v[1]), Number(v[2]))
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
