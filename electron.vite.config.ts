import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * Strengere Content-Security-Policy in de gebouwde app: geen inline scripts of inline
 * event-handlers (alleen ontwikkelmodus heeft die nodig voor hot reload), geen dev-websocket.
 */
const strictCsp = (): Plugin => ({
  name: 'banner-studio-strict-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace("script-src 'self' 'unsafe-inline'", "script-src 'self'").replace(' ws: ', ' ')
})

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer/src') } },
    plugins: [react(), strictCsp()]
  }
})
