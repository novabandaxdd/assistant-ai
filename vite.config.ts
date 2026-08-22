import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // ── Proxy for Roo Code / IBM Bob API ─────────────────────────────────
      // Requests to /api/roo/* are forwarded to the IBM endpoint,
      // bypassing browser CORS restrictions (the proxy runs server-side).
      '/api/roo': {
        target: 'https://servicesessentials.ibm.com',
        changeOrigin: true,
        secure: true,
        rewrite: path => path.replace(/^\/api\/roo/, '/apis/v3'),
        // Forward the Authorization header as-is
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.error('[proxy:roo]', err.message)
          })
          proxy.on('proxyReq', (_proxyReq, req) => {
            console.log('[proxy:roo] →', req.method, req.url)
          })
        },
      },

      // ── Proxy for Cline (when base URL is also remote) ────────────────────
      // Add more proxy rules here for other providers if needed.
    },
  },
  optimizeDeps: {
    include: ['react-force-graph-2d'],
  },
})
