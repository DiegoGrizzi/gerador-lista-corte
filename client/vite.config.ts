import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // O backend (@corte-cloud/server) expõe POST /api/ocr. Fazer proxy
      // aqui evita hardcodar a porta do servidor no código do cliente e
      // também evita ter que lidar com CORS em desenvolvimento.
      '/api': {
        target: 'http://localhost:5175',
        changeOrigin: true,
      },
    },
  },
});
