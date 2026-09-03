import { deflateSync } from 'node:zlib'

export const BINARY_MAGIC_BYTES = new TextEncoder().encode('Kaydara FBX Binary  \0')

class ByteBuf {
  bytes: number[] = []

  get offset(): number {
    return this.bytes.length
  }

  u8(n: number): this {
    this.bytes.push(n & 0xff)
    return this
  }

  u32(n: number): this {
    this.bytes.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff)
    return this
  }

  u64(n: number): this {
    this.u32(n >>> 0)
    this.u32(0)
    return this
  }

  i16(n: number): this {
    const view = new DataView(new ArrayBuffer(2))
    view.setInt16(0, n, true)
    this.bytes.push(view.getUint8(0), view.getUint8(1))
    return this
  }

  i32(n: number): this {
    const view = new DataView(new ArrayBuffer(4))
    view.setInt32(0, n, true)
    this.u32(view.getUint32(0, true))
    return this
  }

  f32(n: number): this {
    const view = new DataView(new ArrayBuffer(4))
    view.setFloat32(0, n, true)
    this.u32(view.getUint32(0, true))
    return this
  }

  f64(n: number): this {
    const view = new DataView(new ArrayBuffer(8))
    view.setFloat64(0, n, true)
    this.u32(view.getUint32(0, true))
    this.u32(view.getUint32(4, true))
    return this
  }

  raw(data: ArrayLike<number> | string): this {
    if (typeof data === 'string') {
      for (let i = 0; i < data.length; i++) this.bytes.push(data.charCodeAt(i) & 0xff)
    } else {
      for (let i = 0; i < data.length; i++) this.bytes.push((data[i] ?? 0) & 0xff)
    }
    return this
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes)
  }
}

export type BuiltProp =
  | { kind: 'C'; value: boolean }
  | { kind: 'Y'; value: number }
  | { kind: 'I'; value: number }
  | { kind: 'L'; value: number }
  | { kind: 'F'; value: number }
  | { kind: 'D'; value: number }
  | { kind: 'S'; value: string }
  | { kind: 'R'; value: Uint8Array }
  | { kind: 'array'; type: 'b' | 'c' | 'd' | 'f' | 'i' | 'l'; values: number[] | boolean[]; compress?: boolean }
  | { kind: 'raw'; type: string; data?: Uint8Array }

export interface BuiltNode {
  name: string
  props?: BuiltProp[]
  children?: BuiltNode[]
}

function writeOffset(buf: ByteBuf, version: number, n: number): void {
  if (version >= 7500) buf.u64(n)
  else buf.u32(n)
}

function encodeProp(prop: BuiltProp): Uint8Array {
  const buf = new ByteBuf()
  if (prop.kind === 'array') {
    buf.raw(prop.type)
    buf.u32(prop.values.length)
    if (prop.compress) {
      const raw = encodeArrayValues(prop.type, prop.values)
      const compressed = deflateSync(Buffer.from(raw))
      buf.u32(1)
      buf.u32(compressed.length)
      buf.raw(compressed)
    } else {
      buf.u32(0)
      const raw = encodeArrayValues(prop.type, prop.values)
      buf.u32(raw.length)
      buf.raw(raw)
    }
    return buf.toUint8Array()
  }

  if (prop.kind === 'raw') {
    buf.raw(prop.type)
    buf.raw(prop.data ?? new Uint8Array())
    return buf.toUint8Array()
  }

  buf.raw(prop.kind)
  switch (prop.kind) {
    case 'C':
      buf.u8(prop.value ? 1 : 0)
      break
    case 'Y':
      buf.i16(prop.value)
      break
    case 'I':
      buf.i32(prop.value)
      break
    case 'L': {
      const view = new DataView(new ArrayBuffer(8))
      view.setBigInt64(0, BigInt(prop.value), true)
      buf.raw(new Uint8Array(view.buffer))
      break
    }
    case 'F':
      buf.f32(prop.value)
      break
    case 'D':
      buf.f64(prop.value)
      break
    case 'S':
      buf.u32(prop.value.length)
      buf.raw(prop.value)
      break
    case 'R':
      buf.u32(prop.value.length)
      buf.raw(prop.value)
      break
  }
  return buf.toUint8Array()
}

function encodeArrayValues(
  type: 'b' | 'c' | 'd' | 'f' | 'i' | 'l',
  values: Array<number | boolean>,
): Uint8Array {
  const buf = new ByteBuf()
  for (const value of values) {
    if (type === 'b' || type === 'c') buf.u8(value ? 1 : 0)
    else if (type === 'i') buf.i32(value as number)
    else if (type === 'l') {
      const view = new DataView(new ArrayBuffer(8))
      view.setBigInt64(0, BigInt(value as number), true)
      buf.raw(new Uint8Array(view.buffer))
    } else if (type === 'f') buf.f32(value as number)
    else buf.f64(value as number)
  }
  return buf.toUint8Array()
}

function writeNode(buf: ByteBuf, version: number, node: BuiltNode): void {
  const headerStart = buf.offset
  const headerSize = (version >= 7500 ? 24 : 12) + 1 + node.name.length
  for (let i = 0; i < headerSize; i++) buf.u8(0)

  const props = node.props ?? []
  const encoded = props.map(encodeProp)
  const propStart = buf.offset
  for (const chunk of encoded) buf.raw(chunk)
  const propLen = buf.offset - propStart

  for (const child of node.children ?? []) writeNode(buf, version, child)

  const endOffset = buf.offset
  const header = new ByteBuf()
  writeOffset(header, version, endOffset)
  writeOffset(header, version, props.length)
  writeOffset(header, version, propLen)
  header.u8(node.name.length)
  header.raw(node.name)

  const written = header.toUint8Array()
  for (let i = 0; i < written.length; i++) {
    buf.bytes[headerStart + i] = written[i] ?? 0
  }
}

function writeNullNode(buf: ByteBuf, version: number): void {
  writeOffset(buf, version, 0)
  writeOffset(buf, version, 0)
  writeOffset(buf, version, 0)
  buf.u8(0)
}

export function buildBinaryFbx(options: {
  version?: number
  nodes?: BuiltNode[]
  footerBytes?: number
}): Uint8Array {
  const version = options.version ?? 7400
  const buf = new ByteBuf()
  buf.raw(BINARY_MAGIC_BYTES)
  buf.u8(0x1a)
  buf.u8(0x00)
  buf.u32(version)

  for (const node of options.nodes ?? []) writeNode(buf, version, node)
  writeNullNode(buf, version)

  // 默认 176 字节尾部占位（120 + 16），与 BinaryParser.endOfContent 使用的
  // 阈值匹配，否则末尾节点会被提前截断。
  const extra = options.footerBytes ?? 176
  for (let i = 0; i < extra; i++) buf.u8(0)
  return buf.toUint8Array()
}
