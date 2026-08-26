import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "public",
  base: "./",
  server: { host: "127.0.0.1", port: 5173 },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: {
        hub: resolve(__dirname, "index.html"),
        sea: resolve(__dirname, "games/sea/index.html"),
      },
    },
  },
});
