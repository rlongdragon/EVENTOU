import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000';

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        // 3D 校園模型是獨立頁面，由地圖頁以 iframe 嵌入
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          campus3d: fileURLToPath(new URL('./campus-3d.html', import.meta.url)),
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
