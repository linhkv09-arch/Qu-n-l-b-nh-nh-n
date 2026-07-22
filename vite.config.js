import { defineConfig } from "vite";

// index.html ở gốc là entry.
// Thư mục public/ chứa js/ và css/ (script thường, không qua bundler) —
// Vite copy nguyên vẹn ra dist/ khi build.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
