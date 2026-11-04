import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, 'src');
const pkg = JSON.parse(readFileSync(resolve(here, 'package.json'), 'utf8')) as { version: string };

/** src/manifest.json を dist 直下に出力し、version を package.json と揃える。 */
function manifestPlugin(): Plugin {
  const manifestPath = resolve(root, 'manifest.json');
  return {
    name: 'engawa:manifest',
    buildStart() {
      this.addWatchFile(manifestPath);
    },
    generateBundle() {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
      manifest.version = pkg.version;
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(manifest, null, 2) });
    },
  };
}

export default defineConfig({
  root,
  publicDir: resolve(here, 'public'),
  plugins: [preact(), manifestPlugin()],
  resolve: {
    alias: { '@shared': resolve(root, 'shared') },
  },
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    target: 'chrome116',
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        sidepanel: resolve(root, 'sidepanel/index.html'),
        options: resolve(root, 'options/index.html'),
        background: resolve(root, 'background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
