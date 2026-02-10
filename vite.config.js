import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Stars/',
  build: {
    outDir: 'dist',
  },
  server: {
    host: true, // Needed for mobile testing on LAN
  }
});
