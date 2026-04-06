import { defineConfig } from 'vite';

export default defineConfig({
  base: '/project-x/',
  server: { port: 3000 },
  build: { outDir: '../docs' }
});
