<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsAction, useSettingsFacts } from '../../settings/useSettingsAction'
import { uuid } from '../../../services/decode'
import { inputDigest } from '../../settings/clients/value'
import { readPublicChain } from './public-chain'
import OperationNotice from '../../settings/components/OperationNotice.vue'
const runtime = useMdm(),
  { t } = useI18n(),
  { canWrite } = usePermission('credentials', 'credentials'),
  { busy, failure, pending, locked, submit } = useSettingsAction(() => 'pki-windows-signing')
const attempt = ref(''),
  chain = ref(''),
  reviewed = ref(false),
  result = ref<{ attempt: string; fingerprint: string }>()
function clear() {
  attempt.value = ''
  chain.value = ''
  reviewed.value = false
  result.value = undefined
}
async function recover() {
  if (locked.value || !canWrite.value) return
  let original: string, input: string[]
  try {
    original = uuid(attempt.value)
    input = readPublicChain(chain.value)
  } catch {
    failure.value = 'invalidRequest'
    return
  }
  if (!reviewed.value) {
    reviewed.value = true
    return
  }
  result.value = undefined
  await submit(
    'recover',
    0,
    { attempt: original, chainSha256: inputDigest(JSON.stringify(input)) },
    (id) => runtime.settings.pki.recover(id, original, input),
    (value) => {
      result.value = value
      chain.value = ''
      reviewed.value = false
    },
  )
}
useSettingsFacts(clear)
</script>
<template>
  <section class="console-panel">
    <h2>{{ t('security.recovery.windows') }}</h2>
    <p>{{ t('security.pki.issuedHint') }}</p>
    <p>{{ t('security.recovery.noQueue') }}</p>
    <OperationNotice
      :operation="pending"
      :busy="busy"
      :can-write="canWrite"
      :query-supported="false"
      :compare-supported="false"
    />
    <p v-if="pending?.state === 'conflict'" role="alert">
      {{ t('security.recovery.conflictHandoff') }}
    </p>
    <form class="settings-form" @submit.prevent="recover">
      <fieldset :disabled="locked || !canWrite">
        <label for="pki-attempt">{{ t('settings.signingAttempt') }}</label
        ><input
          id="pki-attempt"
          v-model="attempt"
          required
          maxlength="36"
          @input="reviewed = false"
        />
        <label for="pki-chain">{{ t('security.recovery.publicChain') }}</label
        ><textarea
          id="pki-chain"
          v-model="chain"
          required
          maxlength="180000"
          spellcheck="false"
          @input="reviewed = false"
        />
        <p>{{ t('security.pki.publicHint') }}</p>
        <p v-if="reviewed">{{ t('security.recovery.confirm') }} · {{ attempt }}</p>
        <UiButton type="submit">{{
          t(reviewed ? 'security.recovery.attach' : 'security.pki.review')
        }}</UiButton>
      </fieldset>
    </form>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <dl v-if="result" class="settings-facts">
      <dt>{{ t('settings.signingAttempt') }}</dt>
      <dd>{{ result.attempt }}</dd>
      <dt>{{ t('security.recovery.fingerprint') }}</dt>
      <dd class="console-locator">{{ result.fingerprint }}</dd>
    </dl>
  </section>
</template>
