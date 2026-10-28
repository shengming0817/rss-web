import { createVuetify } from 'vuetify'
import { en, zhHans } from 'vuetify/locale'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
export function createPreviewVuetify() {
  return createVuetify({
    theme: false,
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
    locale: { locale: 'zhHans', fallback: 'en', messages: { en, zhHans } },
    defaults: {
      VBtn: { color: 'primary', variant: 'flat', rounded: 'lg', elevation: 0 },
      VTextField: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
      VTextarea: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
      VSelect: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
      VAutocomplete: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
      VCheckbox: { density: 'compact', hideDetails: 'auto' },
    },
  })
}
