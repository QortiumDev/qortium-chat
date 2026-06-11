import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  build: {
    assetsInlineLimit: (filePath) =>
      /[/\\]src[/\\]assets[/\\]fonts[/\\].+\.ttf$/.test(filePath) ? true : undefined,
  },
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
  },
});
