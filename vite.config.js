import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon192.png', 'icon512_rounded.png', 'icon512_maskable.png'],
      manifest: {
        name: 'OpsEye',
        short_name: 'OpsEye',
        description: 'OpsEye energy operations platform',
        start_url: '/energy-dashboard',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#020617',
        background_color: '#ffffff',
        lang: 'en-GB',
        icons: [
          { src: '/icon192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon512_rounded.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon512_maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})