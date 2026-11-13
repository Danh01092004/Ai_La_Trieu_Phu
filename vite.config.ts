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
    // Expose the dev server on the LAN so phones can join a room while testing.
    host: true,
    open: true,
    // Pre-transform the multiplayer route while Vite starts, so the first
    // hover/tap on Home does not pay the full dev-module graph cost.
    warmup: {
      clientFiles: [
        './src/pages/multi/Multiplayer.tsx',
        './src/components/multi/RoomLobby.tsx',
        './src/components/multi/MatchStarting.tsx',
        './src/components/multi/MultiplayerGame.tsx',
        './src/components/multi/MultiplayerReveal.tsx',
        './src/components/multi/MultiplayerFinal.tsx',
        './src/components/multi/MultiLifelines.tsx',
        './src/components/multi/LifelineResultCard.tsx',
        './src/components/multi/ChickenLossPage.tsx',
        './src/components/multi/MultiQuestionTimer.tsx',
        './src/multiplayer/useRoom.ts',
        './src/pages/Leaderboard.tsx',
      ],
    },
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:3001',
        ws: true,
      },
      '/api': {
        target: 'http://127.0.0.1:3001',
      },
      '/healthz': {
        target: 'http://127.0.0.1:3001',
      },
    },
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
    include: ['react', 'react-dom', 'framer-motion', 'howler', 'socket.io-client'],
  },
})
