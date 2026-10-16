import { defineConfig } from "vite";

// GitHub Pages serves a project site from https://<user>.github.io/<repository>/,
// so every asset URL has to start with that prefix.
export default defineConfig({
    base: "/PhysLab/",
});