import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
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
