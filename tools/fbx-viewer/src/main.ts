import './style.css'
import {
  AmbientLight,
  Box3,
  BoxHelper,
  Color,
  DirectionalLight,
  GridHelper,
  PerspectiveCamera,
  Scene,
  SkeletonHelper,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { buildScene, parse, FbxAxisUpVector, type FbxNode } from '@infloopgame/lib-fbx'
import { fbxSceneToThree, type ConvertResult } from './fbx-sdk-to-three'
import { fbxTreeToThree, type TreeConvertResult } from './fbx-tree-to-three'
import { diffSnapshots, formatDiffs } from './scene-diff'
import { snapshotScene } from './scene-snapshot'
import { iconForKind, iconSvg } from './scene-tree-icons'
import { displayName, nodeKind } from './scene-tree-model'
import { mountSceneTree } from './scene-tree'

const app = document.querySelector('#app') as HTMLElement
const viewport = document.querySelector('#viewport') as HTMLElement
const hud = document.querySelector('#hud') as HTMLElement
const statusEl = document.querySelector('#toolbar-status') as HTMLElement
const fileInput = document.querySelector('#file') as HTMLInputElement
const wireBtn = document.querySelector('#wire') as HTMLButtonElement
const skelBtn = document.querySelector('#skel') as HTMLButtonElement
const gridBtn = document.querySelector('#grid') as HTMLButtonElement
const frameBtn = document.querySelector('#frame') as HTMLButtonElement
const expandBtn = document.querySelector('#expand') as HTMLButtonElement
const collapseBtn = document.querySelector('#collapse') as HTMLButtonElement
const pathButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-path]')]
const hierBtn = document.querySelector('#toggle-hier') as HTMLButtonElement
const inspBtn = document.querySelector('#toggle-insp') as HTMLButtonElement
const consoleBtn = document.querySelector('#toggle-console') as HTMLButtonElement
const projectBtn = document.querySelector('#toggle-project') as HTMLButtonElement
const layoutSelect = document.querySelector('#layout') as HTMLSelectElement
const searchInput = document.querySelector('#search') as HTMLInputElement
const searchCount = document.querySelector('#search-count') as HTMLElement
const searchPrev = document.querySelector('#search-prev') as HTMLButtonElement
const searchNext = document.querySelector('#search-next') as HTMLButtonElement
const consoleEl = document.querySelector('#console') as HTMLElement
const projectEl = document.querySelector('#project') as HTMLElement
const tabConsole = document.querySelector('#tab-console') as HTMLButtonElement
const tabProject = document.querySelector('#tab-project') as HTMLButtonElement
const hierarchy = document.querySelector('#hierarchy-body') as HTMLElement
const inspector = document.querySelector('#inspector-body') as HTMLElement

const renderer = new WebGLRenderer({ antialias: true, alpha: false })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setClearColor(0x2a2a2a, 1)
viewport.append(renderer.domElement)

const scene = new Scene()
scene.background = new Color(0x2a2a2a)
const camera = new PerspectiveCamera(50, 1, 0.1, 1e6)
camera.position.set(200, 180, 280)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true

const hemi = new AmbientLight(0xffffff, 0.55)
const sun = new DirectionalLight(0xffffff, 1.1)
sun.position.set(80, 160, 120)
scene.add(hemi, sun)

const grid = new GridHelper(400, 20, 0x4a4a4a, 0x353535)
scene.add(grid)

let sdkLoaded: ConvertResult | null = null
let parseLoaded: TreeConvertResult | null = null
let helpers: SkeletonHelper[] = []
let selectHelper: BoxHelper | null = null
let lastLabel = ''
let lastMeta = ''
let sceneRoot: FbxNode | null = null
let pathMode: 'sdk' | 'parse' | 'both' = 'sdk'

function selectedPath(): 'sdk' | 'parse' | 'both' {
  return pathMode
}

function pressed(btn: HTMLButtonElement): boolean {
  return btn.getAttribute('aria-pressed') === 'true'
}

const tree = mountSceneTree(
  { hierarchy, inspector, searchInput, searchCount, searchPrev, searchNext },
  {
    onSelect(node) {
      if (node) highlightNode(node)
      else clearSelectHelper()
    },
    objectFor(node) {
      return sdkLoaded?.nodeMap.get(node) ?? null
    },
  },
)

function clearSelectHelper(): void {
  if (!selectHelper) return
  scene.remove(selectHelper)
  selectHelper.geometry.dispose()
  const mat = selectHelper.material
  if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
  else mat.dispose()
  selectHelper = null
}

function disposeRoot(root: ConvertResult['root']): void {
  scene.remove(root)
  root.traverse((o) => {
    const mesh = o as {
      geometry?: { dispose: () => void }
      material?: { dispose: () => void } | Array<{ dispose: () => void }>
    }
    mesh.geometry?.dispose()
    if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose())
    else mesh.material?.dispose()
  })
}

function highlightNode(node: FbxNode): void {
  clearSelectHelper()
  const obj = sdkLoaded?.nodeMap.get(node)
  if (!obj || selectedPath() === 'parse') return
  selectHelper = new BoxHelper(obj, 0x3a79b0)
  scene.add(selectHelper)
}

function fit(root: Object3D): void {
  const box = new Box3().setFromObject(root)
  if (box.isEmpty()) return
  const size = box.getSize(new Vector3())
  const center = box.getCenter(new Vector3())
  const radius = Math.max(size.x, size.y, size.z, 1)
  controls.target.copy(center)
  camera.position.copy(center).add(new Vector3(radius * 0.9, radius * 0.7, radius * 1.1))
  camera.near = radius / 200
  camera.far = radius * 40
  camera.updateProjectionMatrix()
  const g = Math.max(40, Math.ceil(radius / 50) * 50)
  grid.scale.setScalar(g / 200)
  grid.position.y = box.min.y
}

function setOverlay(result: TreeConvertResult | null, on: boolean): void {
  if (!result) return
  for (const mesh of result.meshes) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      const m = mat as {
        wireframe?: boolean
        transparent?: boolean
        opacity?: number
        color?: Color
        userData: { base?: { wireframe: boolean; transparent: boolean; opacity: number; color: number } }
      }
      if (!m.userData.base) {
        m.userData.base = {
          wireframe: Boolean(m.wireframe),
          transparent: Boolean(m.transparent),
          opacity: m.opacity ?? 1,
          color: m.color?.getHex() ?? 0xcccccc,
        }
      }
      const base = m.userData.base
      if (on) {
        m.wireframe = true
        m.transparent = true
        m.opacity = 0.5
        m.color?.set(0xff5a7a)
      } else {
        m.wireframe = pressed(wireBtn) || base.wireframe
        m.transparent = base.transparent
        m.opacity = base.opacity
        m.color?.setHex(base.color)
      }
    }
  }
}

function visibleRoots(): ConvertResult['root'][] {
  const path = selectedPath()
  const out: ConvertResult['root'][] = []
  if (path !== 'parse' && sdkLoaded) out.push(sdkLoaded.root)
  if (path !== 'sdk' && parseLoaded) out.push(parseLoaded.root)
  return out
}

function applyPath(): void {
  if (sdkLoaded) scene.remove(sdkLoaded.root)
  if (parseLoaded) scene.remove(parseLoaded.root)
  setOverlay(parseLoaded, selectedPath() === 'both')
  for (const root of visibleRoots()) scene.add(root)
  showHelpers()
  applyToggles()
  const focus = visibleRoots()[0]
  if (focus) fit(focus)
  paintStat()
}

function clear(): void {
  clearSelectHelper()
  tree.render(null)
  if (sdkLoaded) disposeRoot(sdkLoaded.root)
  if (parseLoaded) disposeRoot(parseLoaded.root)
  for (const h of helpers) scene.remove(h)
  helpers = []
  sdkLoaded = null
  parseLoaded = null
  sceneRoot = null
  lastLabel = ''
  lastMeta = ''
  paintProject(null)
}

function applyToggles(): void {
  grid.visible = pressed(gridBtn)
  const path = selectedPath()
  const targets = [
    ...(path !== 'parse' && sdkLoaded ? sdkLoaded.meshes : []),
    ...(path === 'parse' && parseLoaded ? parseLoaded.meshes : []),
  ]
  for (const m of targets) {
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    for (const mat of mats) {
      if ('wireframe' in mat) mat.wireframe = pressed(wireBtn)
    }
  }
  for (const h of helpers) h.visible = pressed(skelBtn)
}

function showHelpers(): void {
  for (const h of helpers) scene.remove(h)
  helpers = []
  const root = visibleRoots()[0]
  if (!root) return
  const helper = new SkeletonHelper(root)
  helper.visible = pressed(skelBtn)
  scene.add(helper)
  helpers.push(helper)
}

function paintStat(): void {
  const path = selectedPath()
  const shown = path === 'parse' ? parseLoaded : sdkLoaded
  const s = shown?.stats
  const pathLabel = path === 'both' ? 'SDK + parse 线框' : path
  statusEl.textContent = lastLabel
    ? [lastLabel, lastMeta.replaceAll('\n', ' · '), pathLabel].join('   ')
    : '拖入或选择 .fbx'
  statusEl.title = statusEl.textContent
  hud.textContent = s
    ? [
        path === 'both' ? 'SDK · parse 洋红线框' : path.toUpperCase(),
        `nodes ${s.nodes}   mesh ${s.meshes}   tri ${s.triangles}`,
        `bones ${s.bones}   cluster ${s.clusters}   mat ${s.materials}`,
      ].join('\n')
    : '将 .fbx 拖入视口'
}

function log(text: string, kind: 'dim' | 'ok' | 'warn' | 'err' | 'info' = 'info'): void {
  const line = document.createElement('pre')
  line.className = `log ${kind}`
  line.textContent = text
  consoleEl.append(line)
  consoleEl.scrollTop = consoleEl.scrollHeight
}

function paintProject(root: FbxNode | null): void {
  projectEl.replaceChildren()
  if (!root) {
    const note = document.createElement('p')
    note.className = 'panel-note'
    note.textContent = '尚未加载'
    projectEl.append(note)
    return
  }
  const meshes: FbxNode[] = []
  const materials = new Map<string, string>()
  const walk = (node: FbxNode): void => {
    if (nodeKind(node) === 'Mesh') meshes.push(node)
    for (const mat of node.materials) {
      const name = mat.name || '(material)'
      if (!materials.has(name)) materials.set(name, name)
    }
    for (const child of node.children) walk(child)
  }
  walk(root)
  if (meshes.length === 0 && materials.size === 0) {
    const note = document.createElement('p')
    note.className = 'panel-note'
    note.textContent = '无网格或材质'
    projectEl.append(note)
    return
  }
  for (const node of meshes) projectEl.append(assetTile('Mesh', displayName(node), node))
  for (const name of materials.values()) projectEl.append(assetTile('Material', name, null))
}

function assetTile(kind: 'Mesh' | 'Material', name: string, node: FbxNode | null): HTMLElement {
  const el = document.createElement(node ? 'button' : 'div')
  el.className = 'asset'
  if (el instanceof HTMLButtonElement) el.type = 'button'
  const icon = document.createElement('span')
  icon.className = 'asset-icon'
  icon.dataset.kind = kind
  icon.innerHTML = iconSvg(kind === 'Mesh' ? iconForKind('Mesh') : 'material', 22, 1.5)
  const title = document.createElement('span')
  title.className = 'asset-name'
  title.textContent = name
  title.title = name
  const meta = document.createElement('span')
  meta.className = 'asset-kind'
  meta.textContent = kind
  el.append(icon, title, meta)
  if (node && el instanceof HTMLButtonElement) {
    el.addEventListener('click', () => tree.select(node))
  }
  return el
}

function setPressed(btn: HTMLButtonElement, on: boolean): void {
  btn.setAttribute('aria-pressed', String(on))
  btn.classList.toggle('is-on', on)
}

function syncPanels(): void {
  app.dataset.hier = pressed(hierBtn) ? 'on' : 'off'
  app.dataset.insp = pressed(inspBtn) ? 'on' : 'off'
  const bottomOn = pressed(consoleBtn) || pressed(projectBtn)
  app.dataset.bottom = bottomOn ? 'on' : 'off'
  if (pressed(projectBtn)) showBottom('project')
  else if (pressed(consoleBtn)) showBottom('console')
  requestAnimationFrame(resizeViewport)
}

function applyLayout(name: string): void {
  const sides = name === 'default' || name === 'tall'
  const bottom = name === 'default' || name === 'wide'
  setPressed(hierBtn, sides)
  setPressed(inspBtn, sides)
  setPressed(consoleBtn, bottom)
  setPressed(projectBtn, false)
  syncPanels()
}

function showBottom(which: 'console' | 'project'): void {
  const consoleOn = which === 'console'
  consoleEl.hidden = !consoleOn
  projectEl.hidden = consoleOn
  tabConsole.classList.toggle('is-active', consoleOn)
  tabProject.classList.toggle('is-active', !consoleOn)
  tabConsole.setAttribute('aria-selected', String(consoleOn))
  tabProject.setAttribute('aria-selected', String(!consoleOn))
}

function resizeViewport(): void {
  const w = viewport.clientWidth
  const h = viewport.clientHeight
  if (w < 1 || h < 1) return
  camera.aspect = w / Math.max(h, 1)
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
}

function bindToggle(btn: HTMLButtonElement): void {
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true'
    btn.setAttribute('aria-pressed', String(on))
    btn.classList.toggle('is-on', on)
    applyToggles()
  })
}

function bindSplit(splitter: HTMLElement, read: () => number, write: (next: number) => void, sign: 1 | -1): void {
  const horizontal = (): boolean => splitter.getAttribute('aria-orientation') === 'horizontal'
  splitter.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    splitter.setPointerCapture(e.pointerId)
    splitter.classList.add('is-drag')
    const origin = horizontal() ? e.clientY : e.clientX
    const start = read()
    const move = (ev: PointerEvent): void => {
      const now = horizontal() ? ev.clientY : ev.clientX
      write(start + sign * (now - origin))
    }
    const end = (): void => {
      splitter.classList.remove('is-drag')
      splitter.removeEventListener('pointermove', move)
      splitter.removeEventListener('pointerup', end)
      resizeViewport()
    }
    splitter.addEventListener('pointermove', move)
    splitter.addEventListener('pointerup', end)
  })
  splitter.addEventListener('keydown', (e) => {
    const key = e.key
    if (horizontal() && key !== 'ArrowUp' && key !== 'ArrowDown') return
    if (!horizontal() && key !== 'ArrowLeft' && key !== 'ArrowRight') return
    e.preventDefault()
    const step = e.shiftKey ? 24 : 8
    const dir = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1
    write(read() + sign * dir * step)
    resizeViewport()
  })
}

async function loadBytes(buf: ArrayBuffer, label: string): Promise<void> {
  const t0 = performance.now()
  statusEl.textContent = `解析 ${label} …`
  hud.textContent = `解析 ${label} …`
  try {
    const doc = parse(buf)
    const fbx = buildScene(doc)
    const t1 = performance.now()
    clear()
    sdkLoaded = fbxSceneToThree(fbx)
    parseLoaded = fbxTreeToThree(doc.tree)
    const t2 = performance.now()
    const diffs = diffSnapshots(snapshotScene(sdkLoaded.root), snapshotScene(parseLoaded.root))
    sceneRoot = fbx.rootNode
    tree.render(sceneRoot)
    paintProject(sceneRoot)
    const up = fbx.globalSettings.axisSystem.upVector
    const axis =
      up === FbxAxisUpVector.eZAxis ? 'Z-up → Y-up' : up === FbxAxisUpVector.eXAxis ? 'X-up' : 'Y-up'
    lastLabel = label
    lastMeta = [
      `${doc.format} ${doc.version}  ${axis}`,
      `parse+build ${(t1 - t0).toFixed(0)} ms  toThree ${(t2 - t1).toFixed(0)} ms`,
    ].join('\n')
    log(`${label}  ${doc.format} ${doc.version}  ${axis}`, 'info')
    log(lastMeta.split('\n')[1] ?? '', 'dim')
    log(formatDiffs(diffs), diffs.length === 0 ? 'ok' : 'warn')
    applyPath()
  } catch (err) {
    clear()
    const message = err instanceof Error ? err.message : String(err)
    statusEl.textContent = `失败: ${message}`
    hud.textContent = `失败: ${message}`
    log(`失败: ${message}`, 'err')
  }
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0]
  if (!file) return
  await loadBytes(await file.arrayBuffer(), file.name)
  fileInput.value = ''
})

bindToggle(wireBtn)
bindToggle(skelBtn)
bindToggle(gridBtn)
frameBtn.addEventListener('click', () => {
  const target = selectHelper?.object ?? visibleRoots()[0]
  if (target) fit(target)
})
expandBtn.addEventListener('click', () => tree.setExpanded(true))
collapseBtn.addEventListener('click', () => tree.setExpanded(false))
for (const btn of pathButtons) {
  btn.addEventListener('click', () => {
    const value = btn.dataset.path
    if (value !== 'sdk' && value !== 'parse' && value !== 'both') return
    pathMode = value
    for (const other of pathButtons) {
      const on = other === btn
      other.setAttribute('aria-pressed', String(on))
      other.classList.toggle('is-on', on)
    }
    applyPath()
  })
}
hierBtn.addEventListener('click', () => {
  setPressed(hierBtn, !pressed(hierBtn))
  syncPanels()
})
inspBtn.addEventListener('click', () => {
  setPressed(inspBtn, !pressed(inspBtn))
  syncPanels()
})
consoleBtn.addEventListener('click', () => {
  if (pressed(consoleBtn)) setPressed(consoleBtn, false)
  else {
    setPressed(consoleBtn, true)
    setPressed(projectBtn, false)
  }
  syncPanels()
})
projectBtn.addEventListener('click', () => {
  if (pressed(projectBtn)) setPressed(projectBtn, false)
  else {
    setPressed(projectBtn, true)
    setPressed(consoleBtn, false)
  }
  syncPanels()
})
tabConsole.addEventListener('click', () => {
  setPressed(consoleBtn, true)
  setPressed(projectBtn, false)
  syncPanels()
})
tabProject.addEventListener('click', () => {
  setPressed(projectBtn, true)
  setPressed(consoleBtn, false)
  syncPanels()
})
layoutSelect.addEventListener('change', () => applyLayout(layoutSelect.value))

bindSplit(
  document.querySelector('#split-left') as HTMLElement,
  () => readPx('--hier-w', 248),
  (next) => document.documentElement.style.setProperty('--hier-w', `${clamp(next, 160, 520)}px`),
  1,
)
bindSplit(
  document.querySelector('#split-right') as HTMLElement,
  () => readPx('--insp-w', 300),
  (next) => document.documentElement.style.setProperty('--insp-w', `${clamp(next, 200, 560)}px`),
  -1,
)
bindSplit(
  document.querySelector('#split-bottom') as HTMLElement,
  () => readPx('--bottom-h', 168),
  (next) => {
    const max = Math.round(window.innerHeight * 0.55)
    document.documentElement.style.setProperty('--bottom-h', `${clamp(next, 96, max)}px`)
  },
  -1,
)

document.body.addEventListener('dragover', (e) => {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
})
viewport.addEventListener('dragenter', () => viewport.classList.add('is-drag'))
viewport.addEventListener('dragleave', (e) => {
  if (e.currentTarget === viewport && !viewport.contains(e.relatedTarget as Node | null)) {
    viewport.classList.remove('is-drag')
  }
})
document.body.addEventListener('drop', async (e) => {
  e.preventDefault()
  viewport.classList.remove('is-drag')
  const file = e.dataTransfer?.files[0]
  if (!file) return
  await loadBytes(await file.arrayBuffer(), file.name)
})

new ResizeObserver(() => resizeViewport()).observe(viewport)

function readPx(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name)
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : fallback
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)))
}

log('就绪。打开或拖入 .fbx', 'dim')
paintProject(null)
paintStat()
resizeViewport()

function tick(): void {
  controls.update()
  selectHelper?.update()
  renderer.render(scene, camera)
  requestAnimationFrame(tick)
}
tick()
