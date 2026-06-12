import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@dnd-dice-roller/dice-engine': path.resolve(__dirname, '../dice-engine/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          amplify: ['aws-amplify'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu',
               '@radix-ui/react-toast', '@radix-ui/react-tooltip'],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
