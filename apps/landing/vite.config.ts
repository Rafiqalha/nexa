import { defineConfig } from 'vite';

// Landing statis. assetsInlineLimit 0: font tidak di-inline sebagai data: URI agar CSP bisa
// tetap ketat (font-src 'self'), sama seperti dashboard.
export default defineConfig({
  build: { outDir: 'dist', sourcemap: false, target: 'es2022', assetsInlineLimit: 0 },
  server: { host: '127.0.0.1', port: 5180, strictPort: true },
  preview: { host: '127.0.0.1', port: 5181, strictPort: true },
});
