import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { zhHans } from 'vuetify/locale'
import 'vuetify/styles'
// ref: vuetify v4.3.0 packages/vuetify/src/components/VDialog/VDialog.tsx
export const vuetify = createVuetify({
  components,
  directives,
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  locale: { locale: 'zhHans', messages: { zhHans } },
  theme: {
    defaultTheme: 'access',
    themes: {
      access: {
        dark: false,
        colors: {
          primary: '#557bc1',
          secondary: '#76849b',
          background: '#f7f9fd',
          surface: '#ffffff',
          'surface-variant': '#edf2fb',
          success: '#3c8178',
          warning: '#9a641b',
          error: '#bd4848',
          info: '#577fc0',
        },
      },
      night: {
        dark: true,
        colors: {
          primary: '#a8c4f4',
          secondary: '#b7c5dc',
          background: '#182031',
          surface: '#202c41',
          'surface-variant': '#2c3a53',
          success: '#a8c4f4',
          warning: '#e0b677',
          error: '#ef9b9b',
          info: '#96b7e2',
        },
      },
    },
  },
  defaults: {
    VBtn: {
      rounded: 'lg',
      elevation: 0,
      style: 'text-transform:none;letter-spacing:0;font-weight:550',
    },
    VCard: { rounded: 'lg', elevation: 0 },
    VTextField: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VSelect: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VAutocomplete: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VChip: { size: 'small', variant: 'tonal', rounded: 'lg' },
    VTable: { density: 'comfortable' },
    VDialog: { maxWidth: 700 },
    VAlert: { variant: 'tonal', density: 'compact', rounded: 'lg' },
  },
})
