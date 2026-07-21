import { crx } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    // pdf.js worker must stay a separate .mjs asset. Inlining as data: breaks
    // extension CSP (script-src does not allow data: for workers/scripts).
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    // Keep pdfjs out of pre-bundle so the worker `?url` asset resolves cleanly.
    exclude: ['pdfjs-dist'],
  },
  server: {
    cors: {
      origin: [/chrome-extension:\/\//],
    },
  },
});
