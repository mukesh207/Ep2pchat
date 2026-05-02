import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), "");

  const host = process.env.TAURI_DEV_HOST;
  const backendOrigin = env.VITE_DEV_BACKEND_ORIGIN || "https://api.encryptedchat.in";
  const backendWsOrigin = backendOrigin.startsWith("https://")
    ? backendOrigin.replace("https://", "wss://")
    : backendOrigin.replace("http://", "ws://");

  return {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    },
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
        "/api": {
          target: backendOrigin,
          changeOrigin: true,
        },
        "/health": {
          target: backendOrigin,
          changeOrigin: true,
        },
        "/ws": {
          target: backendWsOrigin,
          ws: true,
        },
      },
    },
  };
});
