import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'

/** Lists the build's hashed files for the service worker (public/sw.js), which caches them all on install so every screen opens offline. */
function assetManifest(): Plugin {
  return {
    name: 'north-asset-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      this.emitFile({ type: 'asset', fileName: 'asset-manifest.json', source: JSON.stringify(Object.keys(bundle).filter(file => file.startsWith('assets/')).sort()) })
    },
  }
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react(), assetManifest()],
  // A new id each build: the service worker's URL carries it, so a deploy is an update the page can offer.
  define: { __NORTH_BUILD__: JSON.stringify(Date.now().toString(36)) },
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
})
