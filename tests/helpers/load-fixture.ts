import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

export function loadFixture(name: string): Buffer {
  return readFileSync(join(fixturesDir, name))
}

export function loadFixtureText(name: string): string {
  return loadFixture(name).toString('utf8')
}

export function fixturePath(name: string): string {
  return join(fixturesDir, name)
}
