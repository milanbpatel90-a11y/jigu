import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      // Proxy to backend API
      '/api': {
        target: 'https://ai-glasses-backend.onrender.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        secure: true
      },
      // Proxy to dashboard
      '/dashboard': {
        target: 'https://test-11-tan.vercel.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dashboard/, ''),
        secure: true
      }
    }
  }
});
