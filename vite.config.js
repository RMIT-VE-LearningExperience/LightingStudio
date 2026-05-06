import { defineConfig } from 'vite'

export default defineConfig({
  base: '/LightingStudio/',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  }
})
