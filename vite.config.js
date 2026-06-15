import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        about: resolve(import.meta.dirname, 'about.html'),
        careers: resolve(import.meta.dirname, 'careers.html'),
      },
      output: {
        // Split heavy, rarely-changing libs into their own chunks so they
        // download in parallel and stay cached across app-code deploys.
        // (Rolldown/Vite 8 expects a function here.)
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three';
          if (id.includes('/node_modules/gsap/')) return 'gsap';
        },
      },
    },
  },
});
