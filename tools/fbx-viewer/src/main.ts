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
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { buildScene, parse, FbxAxisUpVector, type FbxNode } from '@infloopgame/lib-fbx'
import { fbxSceneToThree, type ConvertResult } from './fbx-to-three'
import { fbxTreeToThree, type TreeConvertResult } from './fbx-tree-to-three'
import { diffSnapshots, formatDiffs } from './scene-diff'
import { snapshotScene } from './scene-snapshot'
import { mountSceneTree } from './scene-tree'

const canvasHost = document.body
const stat = document.querySelector('#stat') as HTMLPreElement
const fileInput = document.querySelector('#file') as HTMLInputElement
const wireBox = document.querySelector('#wire') as HTMLInputElement
const skelBox = document.querySelector('#skel') as HTMLInputElement
const gridBox = document.querySelector('#grid') as HTMLInputElement
const diffEl = document.querySelector('#diff') as HTMLPreElement
const outliner = document.querySelector('#outliner') as HTMLElement
const pathInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="path"]')]

const renderer = new WebGLRenderer({ antialias: true, alpha: false })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.setClearColor(0x111318, 1)
canvasHost.append(renderer.domElement)

const scene = new Scene()
scene.background = new Color(0x111318)
const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1e6)
camera.position.set(200, 180, 280)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true

const hemi = new AmbientLight(0xffffff, 0.55)
const sun = new DirectionalLight(0xffffff, 1.1)
sun.position.set(80, 160, 120)
scene.add(hemi, sun)

const grid = new GridHelper(400, 20, 0x3a3f4a, 0x2a2e38)
scene.add(grid)

let sdkLoaded: ConvertResult | null = null
let parseLoaded: TreeConvertResult | null = null
let helpers: SkeletonHelper[] = []
let selectHelper: BoxHelper | null = null
let lastLabel = ''
let lastMeta = ''

function selectedPath(): 'sdk' | 'parse' | 'both' {
  return (pathInputs.find((el) => el.checked)?.value as 'sdk' | 'parse' | 'both') ?? 'sdk'
}

const tree = mountSceneTree(outliner, {
  onSelect(node: FbxNode) {
    highlightNode(node)
  },
})

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
  selectHelper = new BoxHelper(obj, 0x2d6cdf)
  scene.add(selectHelper)
}

function fit(root: ConvertResult['root']): void {
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
        m.wireframe = wireBox.checked || base.wireframe
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
  lastLabel = ''
  lastMeta = ''
  diffEl.hidden = true
  diffEl.textContent = ''
}

function applyToggles(): void {
  grid.visible = gridBox.checked
  const path = selectedPath()
  const targets = [
    ...(path !== 'parse' && sdkLoaded ? sdkLoaded.meshes : []),
    ...(path === 'parse' && parseLoaded ? parseLoaded.meshes : []),
  ]
  for (const m of targets) {
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    for (const mat of mats) {
      if ('wireframe' in mat) mat.wireframe = wireBox.checked
    }
  }
  for (const h of helpers) h.visible = skelBox.checked
}

function showHelpers(): void {
  for (const h of helpers) scene.remove(h)
  helpers = []
  const root = visibleRoots()[0]
  if (!root) return
  const helper = new SkeletonHelper(root)
  helper.visible = skelBox.checked
  scene.add(helper)
  helpers.push(helper)
}

function paintStat(): void {
  if (!lastMeta) return
  const path = selectedPath()
  const shown = path === 'parse' ? parseLoaded : sdkLoaded
  const s = shown?.stats
  stat.textContent = [
    lastLabel,
    lastMeta,
    path === 'both' ? '显示 SDK，parse 洋红线框叠加' : `显示 ${path}`,
    s
      ? `nodes ${s.nodes}  mesh ${s.meshes}  tri ${s.triangles}\nbones ${s.bones}  cluster ${s.clusters}  mat ${s.materials}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

async function loadBytes(buf: ArrayBuffer, label: string): Promise<void> {
  const t0 = performance.now()
  stat.textContent = `解析 ${label} …`
  try {
    const doc = parse(buf)
    const fbx = buildScene(doc)
    const t1 = performance.now()
    clear()
    sdkLoaded = fbxSceneToThree(fbx)
    parseLoaded = fbxTreeToThree(doc.tree)
    const t2 = performance.now()
    const diffs = diffSnapshots(snapshotScene(sdkLoaded.root), snapshotScene(parseLoaded.root))
    tree.render(fbx.rootNode)
    const up = fbx.globalSettings.axisSystem.upVector
    const axis =
      up === FbxAxisUpVector.eZAxis ? 'Z-up → Y-up' : up === FbxAxisUpVector.eXAxis ? 'X-up' : 'Y-up'
    lastLabel = label
    lastMeta = [
      `${doc.format} ${doc.version}  ${axis}`,
      `parse+build ${(t1 - t0).toFixed(0)} ms  toThree ${(t2 - t1).toFixed(0)} ms`,
    ].join('\n')
    diffEl.hidden = false
    diffEl.classList.toggle('ok', diffs.length === 0)
    diffEl.textContent = formatDiffs(diffs)
    applyPath()
  } catch (err) {
    clear()
    stat.textContent = `失败: ${err instanceof Error ? err.message : String(err)}`
  }
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0]
  if (!file) return
  await loadBytes(await file.arrayBuffer(), file.name)
})

for (const el of [wireBox, skelBox, gridBox]) el.addEventListener('change', applyToggles)
for (const el of pathInputs) el.addEventListener('change', applyPath)

canvasHost.addEventListener('dragover', (e) => {
  e.preventDefault()
})
canvasHost.addEventListener('drop', async (e) => {
  e.preventDefault()
  const file = e.dataTransfer?.files[0]
  if (!file) return
  await loadBytes(await file.arrayBuffer(), file.name)
})

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

function tick(): void {
  controls.update()
  selectHelper?.update()
  renderer.render(scene, camera)
  requestAnimationFrame(tick)
}
tick()
