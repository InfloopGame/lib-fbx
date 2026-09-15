/**
 * FBX 二进制格式解析器
 * https://code.blender.org/2013/08/fbx-binary-file-format-specification/
 */
import { BinaryReader } from './binary-reader'
import { inflate } from './inflate'
import { parseConnRef, parseObjectHeader, placeObject } from './object-ref'
import type { FbxProperty } from '../types'
import { FbxError, FbxTree } from '../util'

export class BinaryParser {
  version = 0

  parse(buffer: ArrayBuffer | Uint8Array): FbxTree {
    const reader = new BinaryReader(buffer)
    reader.skip(23)

    this.version = reader.getUint32()

    if (this.version < 6000) {
      throw new FbxError(
        'UNSUPPORTED_VERSION',
        `FBX version not supported, FileVersion: ${this.version}`,
      )
    }

    const allNodes = new FbxTree()

    while (!this.endOfContent(reader)) {
      const node = this.parseNode(reader, this.version)
      if (node !== null) allNodes.add(node.name as string, node)
      else break
    }

    return allNodes
  }

  private endOfContent(reader: BinaryReader): boolean {
    if (reader.size() % 16 === 0) {
      return ((reader.getOffset() + 160 + 16) & ~0xf) >= reader.size()
    }
    return reader.getOffset() + 160 + 16 >= reader.size()
  }

  private parseNode(reader: BinaryReader, version: number): Record<string, unknown> | null {
    const node: Record<string, unknown> = {}

    const endOffset = version >= 7500 ? reader.getUint64() : reader.getUint32()
    const numProperties = version >= 7500 ? reader.getUint64() : reader.getUint32()
    const propertyListLen = version >= 7500 ? reader.getUint64() : reader.getUint32()
    void propertyListLen

    const nameLen = reader.getUint8()
    const name = reader.getString(nameLen)

    if (endOffset === 0) return null

    const propertyList: FbxProperty[] = []

    try {
      for (let i = 0; i < numProperties; i++) {
        propertyList.push(this.parseProperty(reader))
      }
    } catch {
      reader.skip(endOffset - reader.getOffset())
      return null
    }

    node.singleProperty = numProperties === 1 && reader.getOffset() === endOffset

    while (endOffset > reader.getOffset()) {
      const subNode = this.parseNode(reader, version)
      if (subNode !== null) this.parseSubNode(name, node, subNode)
    }

    node.propertyList = propertyList

    const header = parseObjectHeader(propertyList)
    if (header.id !== undefined) node.id = header.id
    if (header.attrName !== '') node.attrName = header.attrName
    if (header.attrType !== '') node.attrType = header.attrType
    if (name !== '') node.name = name

    return node
  }

  private parseSubNode(name: string, node: Record<string, unknown>, subNode: Record<string, unknown>): void {
    const subName = subNode.name as string

    if (subNode.singleProperty === true) {
      const value = (subNode.propertyList as FbxProperty[])[0]

      // 数字数组返回 Float64Array，Array.isArray 认不出来。boolean 数组仍是 boolean[]。
      if (Array.isArray(value) || value instanceof Float64Array) {
        node[subName] = subNode
        subNode.a = value
      } else {
        node[subName] = value
      }
    } else if (name === 'Connections' && (subName === 'C' || subName === 'Connect')) {
      const array: unknown[] = []
      ;(subNode.propertyList as FbxProperty[]).forEach((property, i) => {
        if (i === 0) return
        const ref = parseConnRef(property)
        array.push(ref !== undefined ? ref : property)
      })

      if (node.connections === undefined) node.connections = []
      ;(node.connections as unknown[]).push(array)
    } else if (subName === 'Properties70' || subName === 'Properties60') {
      for (const key of Object.keys(subNode)) {
        node[key] = subNode[key]
      }
    } else if (name === 'Properties70' && subName === 'P') {
      this.assignProperty70(node, subNode.propertyList as FbxProperty[])
    } else if (name === 'Properties60' && subName === 'Property') {
      this.assignProperty60(node, subNode.propertyList as FbxProperty[])
    } else if (subName === 'PoseNode') {
      if (!Array.isArray(node[subName])) {
        node[subName] = node[subName] === undefined ? [] : [node[subName]]
      }
      ;(node[subName] as unknown[]).push(subNode)
    } else {
      placeObject(node, subName, subNode)
    }
  }

  private assignProperty70(node: Record<string, unknown>, pl: FbxProperty[]): void {
    let innerPropName = pl[0] as string
    let innerPropType1 = pl[1] as string
    const innerPropType2 = pl[2] as string
    const innerPropFlag = pl[3] as string
    let innerPropValue: unknown

    if (innerPropName.indexOf('Lcl ') === 0) innerPropName = innerPropName.replace('Lcl ', 'Lcl_')
    if (innerPropType1.indexOf('Lcl ') === 0) innerPropType1 = innerPropType1.replace('Lcl ', 'Lcl_')

    if (
      innerPropType1 === 'Color' ||
      innerPropType1 === 'ColorRGB' ||
      innerPropType1 === 'Vector' ||
      innerPropType1 === 'Vector3D' ||
      innerPropType1.indexOf('Lcl_') === 0
    ) {
      innerPropValue = [pl[4], pl[5], pl[6]]
    } else {
      innerPropValue = pl[4]
    }

    node[innerPropName] = {
      type: innerPropType1,
      type2: innerPropType2,
      flag: innerPropFlag,
      value: innerPropValue,
    }
  }

  private assignProperty60(node: Record<string, unknown>, pl: FbxProperty[]): void {
    let innerPropName = pl[0] as string
    let innerPropType1 = pl[1] as string
    const innerPropFlag = pl[2] as string
    let innerPropValue: unknown

    if (innerPropName.indexOf('Lcl ') === 0) innerPropName = innerPropName.replace('Lcl ', 'Lcl_')
    if (innerPropType1.indexOf('Lcl ') === 0) innerPropType1 = innerPropType1.replace('Lcl ', 'Lcl_')

    if (
      innerPropType1 === 'Color' ||
      innerPropType1 === 'ColorRGB' ||
      innerPropType1 === 'Vector' ||
      innerPropType1 === 'Vector3D' ||
      innerPropType1.indexOf('Lcl_') === 0
    ) {
      innerPropValue = [pl[3], pl[4], pl[5]]
    } else {
      innerPropValue = pl[3]
    }

    node[innerPropName] = {
      type: innerPropType1,
      type2: '',
      flag: innerPropFlag,
      value: innerPropValue,
    }
  }

  private parseProperty(reader: BinaryReader): FbxProperty {
    const type = reader.getString(1)

    switch (type) {
      case 'C':
        return reader.getBoolean()
      case 'D':
        return reader.getFloat64()
      case 'F':
        return reader.getFloat32()
      case 'I':
        return reader.getInt32()
      case 'L':
        return reader.getInt64()
      case 'R':
        return reader.getArrayBuffer(reader.getUint32())
      case 'S':
        return reader.getString(reader.getUint32())
      case 'Y':
        return reader.getInt16()
      case 'b':
      case 'c':
      case 'd':
      case 'f':
      case 'i':
      case 'l':
        return this.parseArrayProperty(reader, type)
      default:
        throw new FbxError('INVALID_DATA', `Unknown property type "${type}"`)
    }
  }

  private parseArrayProperty(
    reader: BinaryReader,
    type: 'b' | 'c' | 'd' | 'f' | 'i' | 'l',
  ): FbxProperty {
    const arrayLength = reader.getUint32()
    const encoding = reader.getUint32()
    const compressedLength = reader.getUint32()

    const source =
      encoding === 0 ? reader : new BinaryReader(inflate(new Uint8Array(reader.getArrayBuffer(compressedLength))))

    switch (type) {
      case 'b':
      case 'c':
        return source.getBooleanArray(arrayLength)
      case 'd':
        return source.getFloat64Array(arrayLength)
      case 'f':
        return source.getFloat32Array(arrayLength)
      case 'i':
        return source.getInt32Array(arrayLength)
      case 'l':
        return source.getInt64Array(arrayLength)
    }
  }
}
