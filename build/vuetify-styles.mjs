import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createVuetify } from 'vuetify'

// ref: vuetify v4.3.0 packages/vuetify/src/composables/theme.ts
const require = createRequire(import.meta.url)
export const neutralThemes = {
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
}

export function vuetifyStyles(scope, themes = neutralThemes) {
  const virtual = 'virtual:vuetify-styles.css'
  return {
    name: 'rss-vuetify-styles',
    resolveId(id) {
      if (id === virtual) return '\0' + virtual
    },
    async load(id) {
      if (id !== '\0' + virtual) return
      const base = await readFile(require.resolve('vuetify/styles'), 'utf8')
      const theme = createVuetify({
        theme: { defaultTheme: Object.keys(themes)[0], scope, themes },
      }).theme.styles.value
      // Keep resets, utilities and theme variables inside this application's surface.
      return `@scope (${scope}) {\n${base.replaceAll(':root', ':scope')}\n}\n${theme.replaceAll(`:where(${scope}) .v-theme--`, `:where(${scope}).v-theme--`)}`
    },
  }
}
