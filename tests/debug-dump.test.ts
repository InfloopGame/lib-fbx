import { inspect } from 'node:util'
import { describe, it } from 'vitest'
import { parse } from '../src/parse'
import { loadFixture, loadFixtureText } from './helpers/load-fixture'

describe.skipIf(process.env.DUMP !== '1')('dump', () => {
  it('ascii-7400', () => {
    console.log(inspect(parse(loadFixtureText('ascii-7400-triangle.fbx')).tree, { depth: 6, colors: false }))
  })
  it('ascii-7300 keys', () => {
    const tree = parse(loadFixture('ascii-7300-multiple-materials.fbx')).tree
    const objects = tree.Objects as Record<string, unknown>
    console.log('top', Object.keys(tree))
    console.log('objects', objects && Object.keys(objects))
    console.log('geometry', objects?.Geometry && Object.keys(objects.Geometry as object))
  })
  it('ascii-6100', () => {
    console.log(inspect(parse(loadFixture('ascii-6100-embedded.fbx')).tree, { depth: 6, colors: false }))
  })
  it('binary-7400', () => {
    console.log(inspect(parse(loadFixture('binary-7400-triangle.fbx')).tree, { depth: 6, colors: false }))
  })
})
