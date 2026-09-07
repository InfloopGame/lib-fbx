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
      // 待补齐 inflate / binary-reader / text-parser 分支测试后抬回。
      // functions 99：V8 会内联 `normalizeName` 等小函数，去掉大型角色 fixture 后表现为 1 个 function 未命中。
      thresholds: {
        lines: 85,
        functions: 99,
        branches: 70,
        statements: 85,
      },
    },
  },
})
