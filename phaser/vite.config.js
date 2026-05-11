import { defineConfig } from 'vite';

export default defineConfig({
  base: '/project-x/',
  server: { port: 3000 },
  publicDir: 'public',
  build: {
    outDir: '../docs',
    // Stable entry URL avoids broken Pages when a CDN serves a cached index.html
    // that still references an old hashed bundle that no longer exists in the repo.
    rollupOptions: {
      output: {
        entryFileNames: 'assets/game.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
