import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { glslInclude } from './vite-plugin-glsl-include';

// `npm run dev:https` runs in the "https" mode and serves over TLS, which iOS
// and Android require before they will deliver deviceorientation events.
export default defineConfig(({ mode }) => ({
  plugins: [glslInclude(), ...(mode === 'https' ? [basicSsl()] : [])],
  server: {
    host: true,
    headers: {
      // Lets the demo read sensors when embedded in an iframe. See README.
      'Permissions-Policy': 'accelerometer=*, gyroscope=*, magnetometer=*',
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
}));
