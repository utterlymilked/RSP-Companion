import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // In dev the API runs separately; in production the server serves this build.
    proxy: { "/api": "http://localhost:3000" },
  },
});
