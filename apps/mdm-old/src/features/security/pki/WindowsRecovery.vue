<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { VAlert, VBtn, VCard, VCardText, VTable, VTextarea, VTextField } from 'vuetify/components'
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
  <v-card :title="t('security.recovery.windows')"
    ><v-card-text>
      <p class="mb-3">{{ t('security.pki.issuedHint') }}</p>
      <v-alert type="info" variant="tonal" class="mb-4">{{
        t('security.recovery.noQueue')
      }}</v-alert>
      <OperationNotice
        :operation="pending"
        :busy="busy"
        :can-write="canWrite"
        :query-supported="false"
        :compare-supported="false"
      />
      <v-alert v-if="pending?.state === 'conflict'" type="warning" variant="tonal">{{
        t('security.recovery.conflictHandoff')
      }}</v-alert>
      <form @submit.prevent="recover">
        <v-text-field
          id="pki-attempt"
          v-model="attempt"
          :label="t('settings.signingAttempt')"
          required
          maxlength="36"
          :disabled="locked || !canWrite"
          @update:model-value="reviewed = false"
        /><v-textarea
          id="pki-chain"
          v-model="chain"
          :label="t('security.recovery.publicChain')"
          required
          maxlength="180000"
          spellcheck="false"
          :disabled="locked || !canWrite"
          @update:model-value="reviewed = false"
        />
        <p class="mb-3">{{ t('security.pki.publicHint') }}</p>
        <v-alert v-if="reviewed" type="warning" variant="tonal" class="mb-3"
          >{{ t('security.recovery.confirm') }} · {{ attempt }}</v-alert
        ><v-btn type="submit" :disabled="locked || !canWrite">{{
          t(reviewed ? 'security.recovery.attach' : 'security.pki.review')
        }}</v-btn>
      </form>
      <v-alert v-if="failure" type="error" variant="tonal" class="mt-3">{{
        t('devices.' + failure)
      }}</v-alert
      ><v-table v-if="result" class="mt-3"
        ><tbody>
          <tr>
            <th>{{ t('settings.signingAttempt') }}</th>
            <td>{{ result.attempt }}</td>
          </tr>
          <tr>
            <th>{{ t('security.recovery.fingerprint') }}</th>
            <td>{{ result.fingerprint }}</td>
          </tr>
        </tbody></v-table
      >
    </v-card-text></v-card
  >
</template>
