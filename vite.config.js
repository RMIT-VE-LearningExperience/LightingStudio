import { defineConfig } from 'vite'

export default defineConfig({
  base: '/LightUp/',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  }
})
