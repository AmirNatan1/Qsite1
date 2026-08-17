import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://qsite1.pages.dev",
  output: "static",
  build: {
    format: "directory",
  },
});
