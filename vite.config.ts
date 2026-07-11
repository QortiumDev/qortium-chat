import { readFileSync } from 'node:fs';
// vitest/config, not vite: the `test` block below is a Vitest extension that
// plain vite's defineConfig rejects under excess-property checking.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  base: './',
  build: {
    assetsInlineLimit: (filePath) =>
      /[/\\]src[/\\]assets[/\\]fonts[/\\].+\.(?:ttf|woff2)$/.test(filePath) ||
      /[/\\]src[/\\]assets[/\\]brand[/\\]qortium-chat-icon\.webp$/.test(filePath)
        ? true
        : undefined,
  },
  define: {
    __APP_VERSION__: JSON.stringify(`v${packageJson.version}`),
  },
  plugins: [
    react(),
    {
      // QAVS manifest (qortium-home docs/APP_VERSIONING.md): X.Y declares the
      // minimum platform level the app is built against; Home reads this file
      // from the published root to show the compatibility badge.
      name: 'qortium-app-manifest',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'qortium-app.json',
          source: `${JSON.stringify({ name: 'Chat', version: packageJson.version }, null, 2)}\n`,
        });
      },
    },
  ],
  test: {
    environment: 'node',
    globals: true,
  },
});
