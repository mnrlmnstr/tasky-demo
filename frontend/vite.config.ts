import vue from '@vitejs/plugin-vue'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

const DEV_SERVER_PORT = 5173
const DEFAULT_API_PROXY_TARGET = 'http://backend:8000'

export default defineConfig(({ mode }) => {
  // An empty prefix also exposes plain environment variables, not only VITE_* ones.
  const env = loadEnv(mode, '.', '')

  return {
    plugins: [vue()],
    server: {
      host: '0.0.0.0',
      port: DEV_SERVER_PORT,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || DEFAULT_API_PROXY_TARGET,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,vue}'],
        // src/api/generated is orval output: regenerated with `npm run api:generate`, never edited by hand.
        exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/api/generated/**'],
        reporter: ['text'],
      },
    },
  }
})
