<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
import { isRssApiError } from '@rss/api/mdm'
import { useMdm } from '../../../context'
import {
  useSettingsAction,
  useSettingsFacts,
  useSettingsSecrets,
} from '../../settings/useSettingsAction'
import {
  recoveryGrant,
  type grantReceipt,
  type issuanceCandidate,
} from '../../enrollment/clients/recovery'
import { uuid } from '../../../services/decode'
import { inputDigest } from '../../settings/clients/value'
import { auditTime } from '../../operations/format'
import { readPublicChain } from './public-chain'
import OperationNotice from '../../settings/components/OperationNotice.vue'
const props = defineProps<{ kind: 'registration' | 'issuance' }>()
const runtime = useMdm(),
  { t } = useI18n(),
  client = runtime.onboarding.recovery,
  { busy, failure, pending, locked, submit } = useSettingsAction(
    () => `agent-recovery:${props.kind}`,
  )
const canWrite = computed(() => {
  const s = runtime.session.state.value
  return s.status === 'authenticated' && s.tenant === runtime.tenant
})
const locator = ref(''),
  originalOperation = ref(''),
  secret = ref(''),
  csr = ref(''),
  platform = ref<'windows' | 'macos'>('windows'),
  chain = ref(''),
  reviewed = ref(false),
  returnedIssuance = ref<string>(),
  grant = ref<ReturnType<typeof grantReceipt>>(),
  candidate = ref<ReturnType<typeof issuanceCandidate>>()
let generation = 0
onBeforeUnmount(() => {
  generation++
})
function clear() {
  generation++
  locator.value = ''
  originalOperation.value = ''
  secret.value = ''
  csr.value = ''
  chain.value = ''
  reviewed.value = false
  returnedIssuance.value = undefined
  grant.value = undefined
  candidate.value = undefined
}
useSettingsSecrets(() => {
  secret.value = ''
  reviewed.value = false
})
useSettingsFacts(clear)
async function capture<T>(request: () => Promise<T>) {
  const own = generation
  try {
    return await request()
  } catch (error) {
    if (own === generation && isRssApiError(error) && error.issuanceId)
      returnedIssuance.value = error.issuanceId
    throw error
  }
}
async function recover() {
  if (locked.value || !canWrite.value) return
  let original: string
  try {
    original = uuid(locator.value)
  } catch {
    failure.value = 'invalidRequest'
    return
  }
  grant.value = undefined
  candidate.value = undefined
  returnedIssuance.value = undefined
  if (props.kind === 'registration') {
    let input: ReturnType<typeof recoveryGrant>
    try {
      input = recoveryGrant({
        wireVersion: 1,
        operationId: originalOperation.value,
        secret: secret.value,
        platform: platform.value,
        csr: csr.value,
      })
    } catch {
      failure.value = 'invalidRequest'
      return
    }
    if (!reviewed.value) {
      reviewed.value = true
      return
    }
    secret.value = ''
    await submit(
      'registration-recovery',
      0,
      {
        registration: original,
        platform: input.platform,
        requestSha256: inputDigest(JSON.stringify(input)),
      },
      () => capture(() => client.registration(original, input)),
      (value) => {
        grant.value = value
        reviewed.value = false
      },
      false,
      input.operationId,
    )
  } else {
    let input: string[], operation: string
    try {
      input = readPublicChain(chain.value)
      operation = uuid(originalOperation.value)
    } catch {
      failure.value = 'invalidRequest'
      return
    }
    if (!reviewed.value) {
      reviewed.value = true
      return
    }
    await submit(
      'issuance-recovery',
      0,
      { issuance: original, chainSha256: inputDigest(JSON.stringify(input)) },
      (id) => capture(() => client.issuance(original, id, input)),
      (value) => {
        candidate.value = value
        chain.value = ''
        reviewed.value = false
      },
      false,
      operation,
    )
  }
}
</script>
<template>
  <section class="console-panel">
    <h2>{{ t(`security.recovery.${kind}`) }}</h2>
    <p>{{ t('security.recovery.noQueue') }}</p>
    <p>
      {{ t(kind === 'registration' ? 'security.recovery.grantHint' : 'security.pki.issuedHint') }}
    </p>
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
        <label :for="'agent-' + kind">{{
          t(
            kind === 'registration'
              ? 'security.recovery.registrationId'
              : 'security.recovery.issuanceId',
          )
        }}</label
        ><input
          :id="'agent-' + kind"
          v-model="locator"
          required
          maxlength="36"
          @input="reviewed = false"
        />
        <label for="agent-recovery-operation">{{
          t('security.recovery.administrativeOperation')
        }}</label
        ><input
          id="agent-recovery-operation"
          v-model="originalOperation"
          required
          maxlength="36"
          @input="reviewed = false"
        />
        <template v-if="kind === 'registration'">
          <label for="agent-recovery-platform">{{ t('security.recovery.platform') }}</label
          ><select id="agent-recovery-platform" v-model="platform" @change="reviewed = false">
            <option value="windows">Windows</option>
            <option value="macos">macOS</option>
          </select>
          <label for="agent-recovery-secret">{{ t('security.recovery.secret') }}</label
          ><input
            id="agent-recovery-secret"
            v-model="secret"
            type="password"
            required
            maxlength="43"
            autocomplete="off"
            @input="reviewed = false"
          />
          <label for="agent-recovery-csr">{{ t('security.recovery.csr') }}</label
          ><textarea
            id="agent-recovery-csr"
            v-model="csr"
            required
            maxlength="43692"
            spellcheck="false"
            @input="reviewed = false"
          />
        </template>
        <template v-else
          ><label for="agent-recovery-chain">{{ t('security.recovery.publicChain') }}</label
          ><textarea
            id="agent-recovery-chain"
            v-model="chain"
            required
            maxlength="180000"
            spellcheck="false"
            @input="reviewed = false"
          />
        </template>
        <p v-if="reviewed">
          {{ t('security.recovery.confirm') }} · {{ locator }} · {{ originalOperation }}
        </p>
        <UiButton type="submit">{{
          t(reviewed ? 'security.recovery.continue' : 'security.pki.review')
        }}</UiButton>
      </fieldset>
    </form>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <p v-if="returnedIssuance" class="console-locator">
      {{ t('security.recovery.issuanceId') }} · {{ returnedIssuance }}
    </p>
    <dl v-if="grant" class="settings-facts">
      <dt>{{ t('security.recovery.grant') }}</dt>
      <dd>{{ grant.grantId }}</dd>
      <dt>{{ t('settings.state') }}</dt>
      <dd>{{ t(`security.recovery.${grant.state}`) }}</dd>
      <dt>{{ t('security.recovery.deadline') }}</dt>
      <dd>{{ auditTime(grant.expiresAt) }}</dd>
      <dt>{{ t('security.recovery.platform') }}</dt>
      <dd>{{ grant.platform }}</dd>
    </dl>
    <template v-if="candidate"
      ><p>{{ t('security.recovery.candidateHint') }}</p>
      <dl class="settings-facts">
        <dt>{{ t('security.recovery.issuanceId') }}</dt>
        <dd>{{ candidate.issuanceId }}</dd>
        <dt>{{ t('security.recovery.originalSigningOperation') }}</dt>
        <dd>{{ candidate.operationId }}</dd>
        <dt>{{ t('security.recovery.deadline') }}</dt>
        <dd>{{ auditTime(candidate.activateBefore) }}</dd>
      </dl></template
    >
  </section>
</template>
