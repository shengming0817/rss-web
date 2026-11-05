import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createElement } from 'react'
import { ConfigProvider } from 'antd'
import { extractStyle } from '@ant-design/static-style-extract'
import { mdmTheme } from './src/theme'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'mdm-static-theme',
      resolveId(id) {
        if (id === 'virtual:mdm-theme.css') return '\0virtual:mdm-theme.css'
      },
      load(id) {
        if (id === '\0virtual:mdm-theme.css')
          return [false, true]
            .map((dark) =>
              extractStyle({
                customTheme: (node) =>
                  createElement(ConfigProvider, { theme: mdmTheme(dark, true) }, node),
              }),
            )
            .join('\n')
      },
    },
  ],
  build: { sourcemap: false, target: 'esnext' },
  server: { host: '127.0.0.1' },
})
