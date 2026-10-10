/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { viteSingleFile } from 'vite-plugin-singlefile'
import fs from 'fs'

const httpsConfig = fs.existsSync('./cert-key.pem') && fs.existsSync('./cert.pem')
  ? {
      key: fs.readFileSync('./cert-key.pem'),
      cert: fs.readFileSync('./cert.pem'),
    }
  : undefined

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  server: {
    host: true,
    https: httpsConfig,
  },
  // Under vitest, resolve Svelte's browser build so mount() works in jsdom.
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
