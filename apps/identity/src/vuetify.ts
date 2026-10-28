import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { en, zhHans } from 'vuetify/locale'

// ref: vuetify v4.3.0 packages/vuetify/src/composables/theme.ts
export function createIdentityVuetify() {
  return createVuetify({
    theme: false,
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
    locale: { locale: 'zhHans', fallback: 'en', messages: { en, zhHans } },
    defaults: {
      VBtn: { variant: 'flat', rounded: 'lg', elevation: 0, color: 'primary' },
      VTextField: { variant: 'outlined', density: 'compact', hideDetails: 'auto', rounded: 'lg' },
      VTextarea: { variant: 'outlined', density: 'compact', hideDetails: 'auto', rounded: 'lg' },
      VSelect: { variant: 'outlined', density: 'compact', hideDetails: 'auto', rounded: 'lg' },
      VCheckbox: { density: 'compact', hideDetails: 'auto', color: 'primary' },
      VDialog: { maxWidth: 680, scrollable: true },
      VTabs: { color: 'primary' },
    },
  })
}
