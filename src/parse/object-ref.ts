/** FBX 对象引用：7.x 用数字 UniqueId，6.x 无 ID 时用名字。 */
export type FbxRef = number | string

const TYPE_PREFIX = /^(\w+)::/

export function stripTypePrefix(value: string): string {
  return value.replace(TYPE_PREFIX, '')
}

function asAttrName(value: unknown): string {
  return typeof value === 'string' && value !== '' ? stripTypePrefix(value) : ''
}

/** 7.x `[id, name, type]`；6.x `[name, type]`。 */
export function parseObjectHeader(propertyList: readonly unknown[]): {
  id?: FbxRef
  attrName: string
  attrType: string
} {
  const first = propertyList[0]
  // ASCII 数组节点是 `Vertices: *6 {`，`*6` 不是对象名。
  if (typeof first === 'string' && /^\*\d+$/.test(first)) {
    return { attrName: '', attrType: '' }
  }
  // 7.x 对象：`id, "Name", "Type"`。`LayerElement*: 0 {` 只有一个整数下标。
  // 几何数据是一串 float/int，第二项不是字符串，不能当 UniqueId。
  if (typeof first === 'number' && Number.isInteger(first)) {
    if (typeof propertyList[1] === 'string') {
      return {
        id: first,
        attrName: asAttrName(propertyList[1]),
        attrType: typeof propertyList[2] === 'string' ? propertyList[2] : '',
      }
    }
    if (propertyList.length === 1) {
      return { id: first, attrName: '', attrType: '' }
    }
  }
  if (typeof first === 'string' && first !== '') {
    const attrName = stripTypePrefix(first)
    const attrType = typeof propertyList[1] === 'string' ? propertyList[1] : ''
    return { id: attrName, attrName, attrType }
  }
  return { attrName: '', attrType: '' }
}

export function objectIndexKey(node: { id?: unknown; attrName?: unknown }): FbxRef | undefined {
  if (typeof node.id === 'number' && Number.isFinite(node.id)) return node.id
  if (typeof node.id === 'string' && node.id !== '') return stripTypePrefix(node.id)
  if (typeof node.attrName === 'string' && node.attrName !== '') return stripTypePrefix(node.attrName)
  return undefined
}

/** 连接里的引用。`Scene` / `RootNode` 原样保留，查找时再当根。 */
export function parseConnRef(value: unknown): FbxRef | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const s = value.trim().replace(/^"+/, '').replace(/"+$/, '').trim()
  if (s === '') return undefined
  if (/^-?\d+$/.test(s)) return Number(s)
  return stripTypePrefix(s)
}

export function isRootRef(ref: FbxRef): boolean {
  return ref === 0 || ref === 'Scene' || ref === 'RootNode'
}

export function refKey(ref: FbxRef): string {
  return String(ref)
}

export function objectRef(raw: { id?: unknown }, key: string): FbxRef | undefined {
  if (typeof raw.id === 'number' && Number.isFinite(raw.id)) return raw.id
  if (typeof raw.id === 'string' && raw.id !== '') return stripTypePrefix(raw.id)
  if (/^-?\d+$/.test(key)) return Number(key)
  if (key === '' || key === 'propertyList' || key === 'name' || key === 'singleProperty') return undefined
  return key
}

function isParsedNode(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const rec = value as Record<string, unknown>
  return (
    rec.singleProperty !== undefined ||
    Array.isArray(rec.propertyList) ||
    typeof rec.attrType === 'string' ||
    typeof rec.attrName === 'string'
  )
}

/** 把同名对象收进 id/名字 → 节点 的 map，避免后写覆盖先写。 */
export function placeObject(parent: Record<string, unknown>, name: string, child: Record<string, unknown>): void {
  const key = objectIndexKey(child)
  const existing = parent[name]

  if (existing === undefined) {
    parent[name] = key !== undefined ? { [String(key)]: child } : child
    return
  }

  if (key === undefined) return

  if (!isParsedNode(existing)) {
    ;(existing as Record<string, unknown>)[String(key)] = child
    return
  }

  const prevKey = objectIndexKey(existing as { id?: unknown; attrName?: unknown })
  const map: Record<string, unknown> = {}
  if (prevKey !== undefined) map[String(prevKey)] = existing
  map[String(key)] = child
  parent[name] = map
}
