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
    {
      name: 'react-mdm-boundary',
      generateBundle() {
        for (const id of this.getModuleIds()) {
          if (
            /\/(?:apps\/mdm-old|packages\/(?:auth|core))\/|\.(?:vue)$|\/node_modules\/(?:\.pnpm\/)?(?:vue(?:@|-)|@vue[+/]|vuetify|pinia)/.test(
              id,
            )
          )
            this.error(`Retired runtime in React MDM graph: ${id}`)
          if (/\/(?:demo|__mocks__)\//.test(id)) this.error(`Demo in product graph: ${id}`)
          const owner =
            /\/packages\/(auth-core|auth-http|mdm-http|mdm-authorization|mdm-tenant-administration|mdm-user-profiles|mdm-devices|mdm-enrollment|mdm-connections|mdm-inventory|mdm-groups|mdm-compliance|mdm-resources|mdm-content|mdm-software|mdm-certificates|mdm-recovery-credentials|mdm-audit|mdm-webhooks|mdm-telemetry|mdm-tenant-setup|mdm-runtime-diagnostics)\//.exec(
              id,
            )?.[1]
          if (owner) {
            const dependencies = this.getModuleInfo(id)?.importedIds ?? []
            for (const dependency of dependencies) {
              const allowed =
                dependency.includes(`/packages/${owner}/`) ||
                (owner === 'auth-http' && /\/packages\/(?:auth-core|api)\//.test(dependency)) ||
                (owner === 'mdm-http' &&
                  /\/packages\/(?:auth-core|api|mdm-authorization|mdm-tenant-administration|mdm-user-profiles|mdm-devices|mdm-enrollment|mdm-connections|mdm-inventory|mdm-groups|mdm-compliance|mdm-resources|mdm-content|mdm-software|mdm-certificates|mdm-recovery-credentials|mdm-audit|mdm-webhooks|mdm-telemetry|mdm-tenant-setup|mdm-runtime-diagnostics)\//.test(
                    dependency,
                  )) ||
                (['mdm-resources', 'mdm-software'].includes(owner) &&
                  /\/packages\/(?:mdm-devices|mdm-inventory|mdm-resources)\//.test(dependency)) ||
                (owner === 'mdm-content' &&
                  (/\/packages\/(?:mdm-resources|mdm-inventory)\//.test(dependency) ||
                    /\/node_modules\/(?:\.pnpm\/)?@noble[+/]hashes/.test(dependency))) ||
                (owner === 'mdm-inventory' && /\/packages\/mdm-devices\//.test(dependency)) ||
                ([
                  'mdm-groups',
                  'mdm-compliance',
                  'mdm-certificates',
                  'mdm-recovery-credentials',
                  'mdm-audit',
                  'mdm-webhooks',
                  'mdm-telemetry',
                ].includes(owner) &&
                  /\/packages\/(?:mdm-devices|mdm-inventory)\//.test(dependency))
              if (!allowed) this.error(`Invalid ${owner} dependency: ${dependency}`)
            }
          }
        }
      },
    },
  ],
  build: { sourcemap: false, target: 'esnext' },
  server: { host: '127.0.0.1' },
})
