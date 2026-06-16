import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@ph/shared': path.resolve(__dirname, '../../packages/shared/index.ts'),
      '@': path.resolve(__dirname, '.'),
    },
  },
})
