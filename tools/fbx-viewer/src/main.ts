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
import { mountSceneTree } from './scene-tree'

const canvasHost = document.body
const stat = document.querySelector('#stat') as HTMLPreElement
const fileInput = document.querySelector('#file') as HTMLInputElement
const wireBox = document.querySelector('#wire') as HTMLInputElement
const skelBox = document.querySelector('#skel') as HTMLInputElement
const gridBox = document.querySelector('#grid') as HTMLInputElement
const outliner = document.querySelector('#outliner') as HTMLElement

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

let loaded: ConvertResult | null = null
let helpers: SkeletonHelper[] = []
let selectHelper: BoxHelper | null = null

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

function highlightNode(node: FbxNode): void {
  clearSelectHelper()
  const obj = loaded?.nodeMap.get(node)
  if (!obj) return
  selectHelper = new BoxHelper(obj, 0x2d6cdf)
  scene.add(selectHelper)
}

function fit(model: ConvertResult): void {
  const box = new Box3().setFromObject(model.root)
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

function clear(): void {
  clearSelectHelper()
  tree.render(null)
  if (loaded) {
    scene.remove(loaded.root)
    loaded.root.traverse((o) => {
      const mesh = o as { geometry?: { dispose: () => void }; material?: { dispose: () => void } | Array<{ dispose: () => void }> }
      mesh.geometry?.dispose()
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose())
      else mesh.material?.dispose()
    })
  }
  for (const h of helpers) scene.remove(h)
  helpers = []
  loaded = null
}

function applyToggles(): void {
  grid.visible = gridBox.checked
  if (!loaded) return
  for (const m of loaded.meshes) {
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
  if (!loaded) return
  const helper = new SkeletonHelper(loaded.root)
  helper.visible = skelBox.checked
  scene.add(helper)
  helpers.push(helper)
}

async function loadBytes(buf: ArrayBuffer, label: string): Promise<void> {
  const t0 = performance.now()
  stat.textContent = `解析 ${label} …`
  try {
    const doc = parse(buf)
    const fbx = buildScene(doc)
    const t1 = performance.now()
    clear()
    loaded = fbxSceneToThree(fbx)
    scene.add(loaded.root)
    tree.render(fbx.rootNode)
    showHelpers()
    applyToggles()
    fit(loaded)
    const t2 = performance.now()
    const s = loaded.stats
    const up = fbx.globalSettings.axisSystem.upVector
    const axis =
      up === FbxAxisUpVector.eZAxis ? 'Z-up → Y-up' : up === FbxAxisUpVector.eXAxis ? 'X-up' : 'Y-up'
    stat.textContent = [
      label,
      `${doc.format} ${doc.version}  ${axis}`,
      `parse+build ${(t1 - t0).toFixed(0)} ms  toThree ${(t2 - t1).toFixed(0)} ms`,
      `nodes ${s.nodes}  mesh ${s.meshes}  tri ${s.triangles}`,
      `bones ${s.bones}  cluster ${s.clusters}  mat ${s.materials}`,
    ].join('\n')
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
