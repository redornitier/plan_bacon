import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [react(), cloudflare({ configPath: process.env.PLAN_BACON_CONFIG ?? 'wrangler.jsonc' })],
  server: { port: 5173, strictPort: true },
});
