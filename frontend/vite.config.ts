import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Écoute sur toutes les interfaces pour être joignable depuis l'hôte quand Vite tourne dans Docker.
    host: true,
    port: 5173,
    strictPort: true,
    watch: {
      // Les modifications faites sous Windows n'arrivent pas toujours au conteneur Linux :
      // le polling, activé par docker-compose.yml, garantit le rechargement à chaud.
      usePolling: process.env.CHOKIDAR_USEPOLLING === 'true',
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
