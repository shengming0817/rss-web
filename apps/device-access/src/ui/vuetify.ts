import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { zhHans } from 'vuetify/locale'
import 'virtual:vuetify-styles.css'
// ref: vuetify v4.3.0 packages/vuetify/src/components/VDialog/VDialog.tsx
export function createAccessVuetify() {
  return createVuetify({
    components,
    directives,
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
    locale: { locale: 'zhHans', messages: { zhHans } },
    theme: false,
    defaults: {
      VBtn: {
        rounded: 'lg',
        elevation: 0,
        class: 'access-button',
      },
      VCard: { rounded: 'lg', elevation: 0 },
      VTextField: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
      VSelect: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
      VAutocomplete: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
      VChip: { size: 'small', variant: 'tonal', rounded: 'lg' },
      VTable: { density: 'comfortable' },
      VDialog: { maxWidth: 700, attach: '.access-surface', VMenu: { attach: '.access-surface' } },
      VMenu: { attach: '.access-surface' },
      VTooltip: { attach: '.access-surface' },
      VAlert: { variant: 'tonal', density: 'compact', rounded: 'lg' },
    },
  })
}
