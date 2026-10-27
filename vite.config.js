import { defineConfig } from "vite";
import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Every folder in projects/ with an index.html becomes its own page.
const projects = readdirSync(resolve(__dirname, "projects"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(resolve(__dirname, "projects", d.name, "index.html")))
  .map((d) => d.name);

export default defineConfig({
  // Relative paths so the build works under https://<user>.github.io/<repo>/.
  base: "./",
  build: {
    // three.js itself is ~750 kB minified; that is expected.
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        ...Object.fromEntries(projects.map((p) => [p, resolve(__dirname, "projects", p, "index.html")])),
      },
    },
  },
});
