import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  const isElectron = process.env.BUILD_TARGET === 'electron'

  return {
    plugins: [
      react(),

      // Only wire up Electron plugin when building for desktop
      ...(isElectron
        ? [
            electron([
              {
                // Main process
                entry: 'electron/main.ts',
                onstart(args) {
                  args.startup()
                },
                vite: {
                  build: {
                    sourcemap: command === 'serve',
                    minify:    command !== 'serve',
                    outDir:    'dist-electron',
                    rollupOptions: {
                      external: ['electron'],
                    },
                  },
                },
              },
              {
                // Preload script
                entry: 'electron/preload.ts',
                onstart(args) {
                  args.reload()
                },
                vite: {
                  build: {
                    sourcemap: command === 'serve' ? 'inline' : false,
                    minify:    command !== 'serve',
                    outDir:    'dist-electron',
                    rollupOptions: {
                      external: ['electron'],
                    },
                  },
                },
              },
            ]),
            renderer(),
          ]
        : []),
    ],

    server: {
      port: 5173,
      proxy: {
        // ── Proxy for Roo Code / IBM Bob API ─────────────────────────────────
        '/api/roo': {
          target:       'https://servicesessentials.ibm.com',
          changeOrigin: true,
          secure:       true,
          rewrite:      path => path.replace(/^\/api\/roo/, '/apis/v3'),
          configure: (proxy) => {
            proxy.on('error', (err) => { console.error('[proxy:roo]', err.message) })
            proxy.on('proxyReq', (_proxyReq, req) => { console.log('[proxy:roo] →', req.method, req.url) })
          },
        },
      },
    },

    optimizeDeps: {
      include: ['react-force-graph-2d'],
    },

    // When building for Electron the renderer needs relative asset paths
    // so index.html can be loaded via file:// protocol
    base: isElectron && command === 'build' ? './' : '/',
  }
})
