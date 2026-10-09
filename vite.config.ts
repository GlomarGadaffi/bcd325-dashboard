import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import fs from 'fs'

const httpsConfig = fs.existsSync('./cert-key.pem') && fs.existsSync('./cert.pem')
  ? {
      key: fs.readFileSync('./cert-key.pem'),
      cert: fs.readFileSync('./cert.pem'),
    }
  : false

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  server: {
    host: true,
    https: httpsConfig,
  },
})
