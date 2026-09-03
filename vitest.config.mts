import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    // Match the tsconfig "@/*" path alias so tests can import app modules the
    // same way the app does.
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
})
