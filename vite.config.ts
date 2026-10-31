import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  plugins: [
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "MPP Notes",
        short_name: "MPP Notes",
        description: "ペンで書く、端末内保存の手書き・PDFノート",
        lang: "ja",
        id: "./",
        start_url: "./",
        scope: "./",
        display: "standalone",
        theme_color: "#345d48",
        background_color: "#eef1ec",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: [
          "**/*.{js,css,html,mjs,wasm,bcmap,pfb,ttf,otf,png,svg,webmanifest}",
        ],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/\/(?:about|privacy|terms)\.html$/],
      },
    }),
  ],
});
