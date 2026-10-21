import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The browser only ever talks to this origin. In development Vite forwards
// /api to the Go server, so the API needs no CORS headers; in production a
// reverse proxy does the same job.
const apiTarget = process.env.LATIHAN_API_URL ?? 'http://localhost:8080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': apiTarget,
    },
  },
  preview: {
    proxy: {
      '/api': apiTarget,
    },
  },
})
