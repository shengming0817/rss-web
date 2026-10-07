<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
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
  <section class="device-console" :aria-busy="busy">
    <h1>{{ t('onboarding.termsTitle') }}</h1>
    <p v-if="failure" role="alert">{{ t('onboarding.termsUnavailable') }}</p>
    <p v-if="expired" role="alert">{{ t('onboarding.termsExpired') }}</p>
    <template v-if="available && context">
      <p>{{ t('onboarding.termsVersion') }}: {{ context.termsVersion }}</p>
      <p v-if="context.mode === 'azureadjoin'">{{ t('onboarding.joinTerms') }}</p>
      <pre class="enrollment-terms">{{ context.termsText }}</pre>
      <form method="post" action="/api/v1/windows/entra/terms/finish">
        <input type="hidden" name="csrfToken" :value="context.csrfToken" />
        <button name="accepted" value="true">{{ t('onboarding.accept') }}</button>
        <button v-if="context.canDecline" name="accepted" value="false">
          {{ t('onboarding.decline') }}
        </button>
      </form>
    </template>
    <button type="button" :disabled="busy" @click="refresh">{{ t('devices.reload') }}</button>
  </section>
</template>
