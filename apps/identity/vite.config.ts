import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { antdStyles } from '../../build/antd-styles'

export default defineConfig({
  plugins: [antdStyles(), react()],
  build: { sourcemap: false },
})
