import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@pos/core/services": path.resolve(__dirname, "../core/src/services/index.ts"),
        "@pos/core/types": path.resolve(__dirname, "../core/src/types/index.ts"),
        "@pos/core/schema": path.resolve(__dirname, "../core/src/schema/index.ts"),
        "@pos/core/utils": path.resolve(__dirname, "../core/src/utils/index.ts"),
        "@pos/core/validators": path.resolve(__dirname, "../core/src/validators/index.ts"),
        "@pos/core": path.resolve(__dirname, "../core/src/index.ts"),
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
        "@pos/core/services": path.resolve(__dirname, "../core/src/services/index.ts"),
        "@pos/core/types": path.resolve(__dirname, "../core/src/types/index.ts"),
        "@pos/core/schema": path.resolve(__dirname, "../core/src/schema/index.ts"),
        "@pos/core/utils": path.resolve(__dirname, "../core/src/utils/index.ts"),
        "@pos/core/validators": path.resolve(__dirname, "../core/src/validators/index.ts"),
        "@pos/core": path.resolve(__dirname, "../core/src/index.ts"),
      },
    },
    plugins: [react()],
  },
});
