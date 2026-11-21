import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from the root of Firebase Hosting (sunday-showdown-fe8ec.web.app and the custom domain).
export default defineConfig({
  base: "/",
  plugins: [react()],
});
