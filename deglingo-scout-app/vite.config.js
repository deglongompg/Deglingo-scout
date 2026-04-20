import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy /api/* vers prod pour tester les Cloudflare Functions en dev local
      '/api': {
        target: 'https://scout.deglingosorare.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
