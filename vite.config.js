import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: `http://localhost:${Number(process.env.API_PORT) || 8787}`,
        changeOrigin: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          three: [
            "three",
            "three/examples/jsm/controls/OrbitControls.js",
            "three/examples/jsm/loaders/GLTFLoader.js"
          ]
        }
      }
    }
  }
});
