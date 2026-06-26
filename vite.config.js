import { defineConfig } from 'vite';

export default defineConfig({
  envPrefix: 'NEXT_PUBLIC_',
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
        payment: './client_payment.html'
      }
    }
  }
});
