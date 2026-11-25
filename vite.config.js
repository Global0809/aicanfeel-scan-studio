import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: "./",
  build: {
    target: "es2021",
    rollupOptions: {
      input: {
        viewer: fileURLToPath(new URL("./index.html", import.meta.url)),
        studio: fileURLToPath(new URL("./studio.html", import.meta.url)),
      },
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/three/")) return "three";
        }
      }
    }
  }
});
