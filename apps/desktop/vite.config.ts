import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const backendOrigin = process.env.VITE_DEV_BACKEND_ORIGIN || "http://localhost:3000";
const backendWsOrigin = backendOrigin.startsWith("https://")
  ? backendOrigin.replace("https://", "wss://")
  : backendOrigin.replace("http://", "ws://");

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      '/api': {
        target: backendOrigin,
        changeOrigin: true,
      },
      '/ws': {
        target: backendWsOrigin,
        ws: true,
      }
    }
  },
}));
