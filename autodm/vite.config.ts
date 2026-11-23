import { seedDesignPlugin } from "@seed-design/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API = `http://localhost:${process.env.PORT ?? 8787}`;

export default defineConfig({
  plugins: [react(), seedDesignPlugin({ colorMode: "light-only" })],
  resolve: { tsconfigPaths: true },
  server: {
    port: 5173,
    // 실제 인스타그램 연동을 개발 서버로 시험할 때 터널 주소 허용
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.app"],
    proxy: {
      "/api": { target: API, changeOrigin: true },
      "/r/": { target: API, changeOrigin: true },
      "/auth": { target: API, changeOrigin: true },
      "/webhooks": { target: API, changeOrigin: true },
    },
  },
  build: { outDir: "dist", chunkSizeWarningLimit: 1500 },
});
