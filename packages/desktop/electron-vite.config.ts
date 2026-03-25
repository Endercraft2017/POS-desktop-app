import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@pos/core": path.resolve(__dirname, "../core/src"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: "src/renderer",
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, "src/renderer/index.html"),
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src/renderer"),
        "@pos/core": path.resolve(__dirname, "../core/src"),
      },
    },
    plugins: [react()],
  },
});
