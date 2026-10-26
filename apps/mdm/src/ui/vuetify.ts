import { createVuetify } from 'vuetify'
import {
  VAlert,
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCheckbox,
  VChip,
  VDefaultsProvider,
  VDialog,
  VLocaleProvider,
  VProgressCircular,
  VSelect,
  VSpacer,
  VTab,
  VTable,
  VTabs,
  VTextField,
  VThemeProvider,
} from 'vuetify/components'
import { Ripple } from 'vuetify/directives'
import { en, zhHans } from 'vuetify/locale'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'

export function createDeviceVuetify() {
  return createVuetify({
    components: {
      VAlert,
      VBtn,
      VCard,
      VCardActions,
      VCardText,
      VCheckbox,
      VChip,
      VDefaultsProvider,
      VDialog,
      VLocaleProvider,
      VProgressCircular,
      VSelect,
      VSpacer,
      VTab,
      VTable,
      VTabs,
      VTextField,
      VThemeProvider,
    },
    directives: { Ripple },
    // External CSS is generated at build time. Never inject a runtime <style> into the strict host.
    theme: false,
    locale: { locale: 'zhHans', fallback: 'en', messages: { en, zhHans } },
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
    defaults: {
      VBtn: { variant: 'flat', rounded: 'lg', elevation: 0, class: 'device-button' },
      VTextField: { variant: 'outlined', density: 'compact', hideDetails: 'auto', rounded: 'lg' },
      VSelect: { variant: 'outlined', density: 'compact', hideDetails: 'auto', rounded: 'lg' },
      VCheckbox: { density: 'compact', hideDetails: 'auto', color: 'primary' },
      VChip: { size: 'small', variant: 'tonal', rounded: 'lg' },
      VDialog: { maxWidth: 680, attach: true },
      VTabs: { color: 'primary' },
    },
  })
}
