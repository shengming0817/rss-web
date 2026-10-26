import type { Plugin } from 'vite'
import { readFile } from 'node:fs/promises'
import { createVuetify } from 'vuetify'

// Build-only rendering through Vuetify's public theme API; production CSP stays style-src 'self'.
// ref: vuetifyjs/vuetify packages/vuetify/src/composables/theme.ts@v4.3.0
export function deviceStyles(): Plugin {
  const virtual = 'virtual:mdm-device-styles.css'
  return {
    name: 'mdm-device-styles',
    resolveId(id) {
      if (id === virtual) return '\0' + virtual
    },
    async load(id) {
      if (id !== '\0' + virtual) return
      const base = await readFile(new URL(import.meta.resolve('vuetify/styles')), 'utf8')
      const theme = createVuetify({
        theme: {
          defaultTheme: 'light',
          scope: '.mdm-device-surface',
          themes: {
            light: {
              dark: false,
              colors: {
                primary: '#28292e',
                secondary: '#626b80',
                background: '#ffffff',
                surface: '#ffffff',
                'surface-variant': '#f5f5f7',
                error: '#bb4149',
                success: '#297357',
                warning: '#986c24',
                info: '#4565a3',
              },
            },
            dark: {
              dark: true,
              colors: {
                primary: '#e4e5eb',
                secondary: '#a1a9bd',
                background: '#191a1e',
                surface: '#202126',
                'surface-variant': '#292b32',
                error: '#ed929b',
                success: '#80c8a4',
                warning: '#dbb673',
                info: '#9bb7ef',
              },
            },
          },
        },
      }).theme.styles.value
      // Scope the upstream reset/utilities so navigation, authentication and other workspaces retain their styles.
      return `@scope (.mdm-device-surface) {\n${base}\n}\n${theme.replaceAll(':where(.mdm-device-surface) .v-theme--', ':where(.mdm-device-surface).v-theme--')}`
    },
  }
}
