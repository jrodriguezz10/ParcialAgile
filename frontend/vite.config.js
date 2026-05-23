import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "REACT_APP_"],
  server: {
    host: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT || 3001),
  },
});
