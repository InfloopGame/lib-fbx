import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/types.ts',
        'src/sdk/math.ts',
        'src/sdk/core.ts',
        'src/sdk/scene.ts',
        'src/sdk/geometry.ts',
        'src/sdk/shading.ts',
        'src/sdk/animation.ts',
        'src/sdk/constraint.ts',
        'src/sdk/index.ts',
      ],
      // 待补齐 inflate / binary-reader / text-parser 分支测试后回到 100%。
      thresholds: {
        lines: 85,
        functions: 100,
        branches: 70,
        statements: 85,
      },
    },
  },
})
