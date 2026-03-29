import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const copyPdfTemplatesPlugin = () => ({
  name: 'copy-pdf-templates',
  apply: 'build',
  closeBundle: () => {
    const sourceDir = path.resolve(__dirname, './pdf');
    const targetDir = path.resolve(__dirname, './dist/pdf');

    if (!fs.existsSync(sourceDir)) {
      return;
    }

    fs.mkdirSync(targetDir, { recursive: true });
    fs.cpSync(sourceDir, targetDir, { recursive: true });
  },
});

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/PROTOTYPE/' : '/',
  plugins: [react(), copyPdfTemplatesPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-maps': ['leaflet', 'react-leaflet', 'leaflet.heat'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
}));
