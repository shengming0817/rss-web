<script setup lang="ts">
import { VAlert, VBtn } from 'vuetify/components'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { postApiV1WindowsEntraTermsFinish } from '@rss/api/mdm-operations'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import MdmPage from '../../../ui/MdmPage.vue'
const runtime = useMdm(),
  { t } = useI18n(),
  { run, busy, failure } = useOperation()
const context = ref<Awaited<ReturnType<typeof runtime.onboarding.entra.context>>>(),
  expired = ref(false)
const available = computed(() => context.value && !expired.value)
let timer: ReturnType<typeof setTimeout> | undefined
function clear() {
  if (context.value) context.value.csrfToken = ''
  context.value = undefined
  clearTimeout(timer)
}
function refresh() {
  clear()
  expired.value = false
  void run(
    () => runtime.onboarding.entra.context(),
    (v) => {
      const remaining = v.expiresAt * 1000 - Date.now()
      if (remaining <= 0) {
        expired.value = true
        return
      }
      context.value = v
      timer = setTimeout(
        () => {
          expired.value = true
          clear()
        },
        Math.min(remaining, 300_000),
      )
    },
  )
}
window.addEventListener('pagehide', clear)
onBeforeUnmount(() => {
  clear()
  window.removeEventListener('pagehide', clear)
})
refresh()
</script>
<template>
  <MdmPage :title="t('onboarding.termsTitle')" :busy="busy">
    <v-alert v-if="failure" type="error" variant="tonal" role="alert">{{
      t('onboarding.termsUnavailable')
    }}</v-alert>
    <v-alert v-if="expired" type="error" variant="tonal" role="alert">{{
      t('onboarding.termsExpired')
    }}</v-alert>
    <template v-if="available && context">
      <p>{{ t('onboarding.termsVersion') }}: {{ context.termsVersion }}</p>
      <p v-if="context.mode === 'azureadjoin'">{{ t('onboarding.joinTerms') }}</p>
      <pre class="enrollment-terms">{{ context.termsText }}</pre>
      <form
        :method="postApiV1WindowsEntraTermsFinish.method"
        :action="postApiV1WindowsEntraTermsFinish.url({})"
      >
        <input type="hidden" name="csrfToken" :value="context.csrfToken" />
        <v-btn name="accepted" value="true" type="submit">{{ t('onboarding.accept') }}</v-btn>
        <v-btn v-if="context.canDecline" name="accepted" value="false" type="submit">
          {{ t('onboarding.decline') }}
        </v-btn>
      </form>
    </template>
    <v-btn type="button" :disabled="!!busy" @click="refresh">{{ t('devices.reload') }}</v-btn>
  </MdmPage>
</template>
