import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      process: 'process/browser',
      stream: 'stream-browserify',
      util: 'util',
      buffer: 'buffer',
      events: 'events',
    }
  },
  define: {
    global: 'window',
  },
});
