import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const repo = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: resolve(repo, 'tests/fixtures'),
  resolve: {
    alias: {
      '@infloopgame/lib-fbx': resolve(repo, 'src/index.ts'),
    },
  },
  server: {
    fs: { allow: [repo] },
    host: '127.0.0.1',
    port: 4173,
  },
})
