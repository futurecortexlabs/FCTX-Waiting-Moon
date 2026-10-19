import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages はサブパス（/FCTX-Waiting-Moon/）で配信されるので相対パスで出力する
  base: './',
  server: { port: 5173, open: true },
  build: { target: 'es2022' },
});
