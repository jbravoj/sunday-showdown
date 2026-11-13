import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://jbravoj.github.io/sunday-showdown/
export default defineConfig({
  base: "/sunday-showdown/",
  plugins: [react()],
});
