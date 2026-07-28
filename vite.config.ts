import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// `environmentMatchGlobs` was removed in Vitest 4 (silently ignored, not even a
// deprecation warning). The modern equivalent is `test.projects`, but
// `extends: true` merges array options (like `include`) by concatenation, not
// override, so a narrowed `include` on a project ends up unioned back to the
// root's broad include. To keep the two environments mutually exclusive, each
// project below is fully self-contained (no `extends`) and repeats the Vite
// config it needs (plugin, alias).
const jsdomDirs = ['ui', 'routes', 'render', 'data', 'audio']

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) }

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: jsdomDirs.map((dir) => `src/${dir}/**`),
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          // Cần thiết để `@testing-library/react` dọn DOM sau mỗi test — xem
          // giải thích trong file. KHÔNG phải jest-dom (không thêm matcher).
          setupFiles: ['./src/ui/__tests__/setup.ts'],
          include: jsdomDirs.flatMap((dir) => [
            `src/${dir}/**/*.test.ts`,
            `src/${dir}/**/*.test.tsx`,
          ]),
        },
      },
    ],
  },
})
