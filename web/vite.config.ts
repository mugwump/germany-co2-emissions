import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  server: {
    host: true, // listen on 0.0.0.0 so the dev server is reachable from the host
    port: 3000,
    // Poll for changes when running in a container bind mount (macOS fs events
    // don't propagate reliably across the Docker boundary). Set VITE_USE_POLLING=1.
    watch: { usePolling: !!process.env.VITE_USE_POLLING },
  },
  plugins: [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
