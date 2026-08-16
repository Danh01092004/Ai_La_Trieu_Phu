import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react({
      // Babel plugin for faster React refresh in dev
      babel: {
        plugins: [],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    // Increase the warning threshold slightly (407KB is fine for a game)
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Split vendor libs into separate chunks for better caching
        manualChunks: {
          // React core — rarely changes
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Framer Motion — large, separate chunk
          'vendor-framer': ['framer-motion'],
          // Audio — Howler
          'vendor-howler': ['howler'],
        },
      },
    },
  },
  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: ['react', 'react-dom', 'framer-motion', 'howler'],
  },
})
