import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: './',  // Use relative paths for Electron
      server: {
        port: 3001,
        host: '0.0.0.0',
        proxy: {
          '/api/posabit': {
            target: 'https://app.posabit.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/posabit/, '/api/v3'),
            secure: true,
          }
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
