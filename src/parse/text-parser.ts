/**
 * FBX ASCII 格式解析器
 */
import { FbxTree } from '../util'

export class TextParser {
  private currentIndent = 0
  private allNodes!: FbxTree
  private nodeStack: Record<string, unknown>[] = []
  private fbxVersion = 7000

  parse(text: string, fbxVersion: number): FbxTree {
    this.fbxVersion = fbxVersion || 7000
    this.currentIndent = 0
    this.allNodes = new FbxTree()
    this.nodeStack = []

    const lines = text.split(/[\r\n]+/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''

      if (line.match(/^[\s\t]*;/) || line.match(/^[\s\t]*$/)) continue

      const matchBeginning = line.match('^\\t{' + this.currentIndent + '}(\\w+):(.*){')
      const matchProperty = line.match('^\\t{' + this.currentIndent + '}(\\w+):[\\s\\t\\r\\n](.*)')
      const matchEnd = line.match('^\\t{' + (this.currentIndent - 1) + '}}')

      if (matchBeginning) {
        this.parseNodeBegin(matchBeginning)
      } else if (matchProperty) {
        const propName = matchProperty[1]
        const propValue = (matchProperty[2] ?? '').trim()
        const contentLine =
          propName === 'Content' && propValue === ',' ? lines[++i] : undefined
        this.parseNodeProperty(matchProperty, contentLine)
      } else if (matchEnd) {
        this.popStack()
      } else if (line.match(/^[^\s\t}]/)) {
        this.parseNodePropertyContinued(line)
      }
    }

    return this.allNodes
  }

  private getPrevNode(): Record<string, unknown> {
    return this.nodeStack[this.currentIndent - 2] ?? {}
  }

  private getCurrentNode(): Record<string, unknown> {
    return this.nodeStack[this.currentIndent - 1] ?? {}
  }

  private pushStack(node: Record<string, unknown>): void {
    this.nodeStack.push(node)
    this.currentIndent += 1
  }

  private popStack(): void {
    this.nodeStack.pop()
    this.currentIndent -= 1
  }

  private parseNodeBegin(property: RegExpMatchArray): void {
    const nodeName = (property[1] ?? '').trim().replace(/^"/, '').replace(/"$/, '')
    const nodeAttrs = (property[2] ?? '').split(',').map((attr) => {
      return attr.trim().replace(/^"/, '').replace(/"$/, '')
    })

    const node: Record<string, unknown> = { name: nodeName }
    const attrs = this.parseNodeAttr(nodeAttrs)
    const currentNode = this.getCurrentNode()

    if (this.currentIndent === 0) {
      this.allNodes.add(nodeName, node)
    } else if (nodeName in currentNode) {
      if (nodeName === 'PoseNode') {
        ;(currentNode.PoseNode as unknown[]).push(node)
      } else if ((currentNode[nodeName] as Record<string, unknown>).id !== undefined) {
        const existing = currentNode[nodeName] as Record<string, unknown>
        currentNode[nodeName] = { [String(existing.id)]: existing }
      }
      if (attrs.id !== '') {
        ;(currentNode[nodeName] as Record<string, unknown>)[String(attrs.id)] = node
      }
    } else if (typeof attrs.id === 'number') {
      currentNode[nodeName] = { [attrs.id]: node }
    } else if (nodeName !== 'Properties70' && nodeName !== 'Properties60') {
      currentNode[nodeName] = nodeName === 'PoseNode' ? [node] : node
    }

    if (typeof attrs.id === 'number') node.id = attrs.id
    if (attrs.name !== '') node.attrName = attrs.name
    if (attrs.type !== '') node.attrType = attrs.type

    this.pushStack(node)
  }

  private parseNodeAttr(attrs: string[]): { id: number | string; name: string; type: string } {
    let id: number | string = attrs[0] ?? ''

    if (attrs[0] !== '') {
      id = parseInt(attrs[0] ?? '', 10)
      if (Number.isNaN(id)) id = attrs[0] ?? ''
    }

    let name = ''
    let type = ''
    if (attrs.length > 1) {
      name = (attrs[1] ?? '').replace(/^(\w+)::/, '')
      type = attrs[2] ?? ''
    }

    return { id, name, type }
  }

  private parseNodeProperty(property: RegExpMatchArray, contentLine?: string): void {
    let propName = (property[1] ?? '').replace(/^"/, '').replace(/"$/, '').trim()
    let propValue: string | unknown[] = (property[2] ?? '').replace(/^"/, '').replace(/"$/, '').trim()

    if (propName === 'Content' && propValue === ',') {
      propValue = (contentLine ?? '').replace(/"/g, '').replace(/,$/, '').trim()
    }

    const currentNode = this.getCurrentNode()
    const parentName = currentNode.name as string

    if (parentName === 'Properties70' || parentName === 'Properties60') {
      this.parseNodeSpecialProperty(propName, propValue as string)
      return
    }

    if (propName === 'C') {
      const parts = (propValue as string).split(',')
      const from = parseInt(parts[1] ?? '', 10)
      const to = parseInt(parts[2] ?? '', 10)
      const rest = parts.slice(3).map((elem) => elem.trim().replace(/^"/, ''))
      propName = 'connections'
      propValue = [from, to, ...rest]
      if (currentNode[propName] === undefined) currentNode[propName] = []
    }

    if (propName === 'Node') currentNode.id = propValue

    if (propName in currentNode && Array.isArray(currentNode[propName])) {
      ;(currentNode[propName] as unknown[]).push(propValue)
    } else if (propName !== 'a') {
      currentNode[propName] = propValue
    } else {
      currentNode.a = propValue
    }

    if (propName === 'a' && (propValue as string).slice(-1) !== ',') {
      currentNode.a = parseNumberArray(propValue as string)
    }
  }

  private parseNodePropertyContinued(line: string): void {
    const currentNode = this.getCurrentNode()
    currentNode.a = (currentNode.a as string) + line

    if (line.slice(-1) !== ',') {
      currentNode.a = parseNumberArray(currentNode.a as string)
    }
  }

  private parseNodeSpecialProperty(_propName: string, propValue: string): void {
    const props = propValue.split('",').map((prop) => {
      return prop.trim().replace(/^"/, '').replace(/\s/, '_')
    })

    const innerPropName = props[0] ?? ''
    const innerPropType1 = props[1] ?? ''
    let innerPropValue: unknown = this.fbxVersion < 7000 ? props[3] : props[4]

    switch (innerPropType1) {
      case 'int':
      case 'enum':
      case 'bool':
      case 'ULongLong':
      case 'double':
      case 'Number':
      case 'FieldOfView':
        innerPropValue = parseFloat(innerPropValue as string)
        break
      case 'Color':
      case 'ColorRGB':
      case 'Vector3D':
      case 'Lcl_Translation':
      case 'Lcl_Rotation':
      case 'Lcl_Scaling':
        // 3-tuple 保持 number[]（长度小、tuple 语义）。
        innerPropValue = parseNumberTuple(innerPropValue as string)
        break
    }

    this.getPrevNode()[innerPropName] = {
      type: innerPropType1,
      type2: this.fbxVersion < 7000 ? '' : (props[2] ?? ''),
      flag: this.fbxVersion < 7000 ? (props[2] ?? '') : (props[3] ?? ''),
      value: innerPropValue,
    }

  }
}

/**
 * 数据数组（`.a` 后的顶点/权重/keyframe 等）解析为 Float64Array。
 * 与 binary-reader 约定一致：所有数字数组统一用 Float64Array 减少内存与遍历开销。
 */
function parseNumberArray(value: string): Float64Array {
  const parts = value.split(',')
  const out = new Float64Array(parts.length)
  for (let i = 0; i < parts.length; i++) out[i] = parseFloat(parts[i] ?? '')
  return out
}

/** 3-元素 tuple（Vector3D / Color / Lcl_*）保留 number[]，避免为固定小尺寸元组过度使用 typed array。 */
function parseNumberTuple(value: string): number[] {
  return value.split(',').map((val) => parseFloat(val))
}
