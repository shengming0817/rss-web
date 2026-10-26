<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  VAlert,
  VBtn,
  VCard,
  VCardText,
  VSelect,
  VTable,
  VTextarea,
  VTextField,
} from 'vuetify/components'
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
import { usePermission } from '../../enrollment/usePermission'
import { uuid } from '../../../services/decode'
import { inputDigest } from '../../settings/clients/value'
import { auditTime } from '../../operations/format'
import { readPublicChain } from './public-chain'
import OperationNotice from '../../settings/components/OperationNotice.vue'
const props = defineProps<{
  kind: 'registration' | 'issuance'
  registration?: string | undefined
  platform?: 'windows' | 'macos' | undefined
}>()
const runtime = useMdm(),
  { t } = useI18n(),
  client = runtime.onboarding.recovery,
  { busy, failure, pending, locked, submit, query } = useSettingsAction(
    () => `agent-recovery:${props.kind}${props.registration ? ':' + props.registration : ''}`,
  )
const { canWrite } = usePermission('credentials', 'credentials')
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
watch(
  () => [props.registration, props.platform],
  () => {
    clear()
    locator.value = props.kind === 'registration' ? (props.registration ?? '') : ''
    platform.value = props.platform ?? 'windows'
  },
  { immediate: true, flush: 'sync' },
)
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
async function recover(replay = false) {
  if ((!replay && locked.value) || !canWrite.value || (replay && props.kind !== 'issuance')) return
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
    if (!replay && !reviewed.value) {
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
      replay,
      operation,
    )
  }
}
async function lookup() {
  if (props.kind !== 'issuance') return
  candidate.value = undefined
  returnedIssuance.value = undefined
  try {
    const original = pending.value
    const issuance = original
      ? uuid((JSON.parse(original.publicInput) as { issuance: string }).issuance)
      : uuid(locator.value)
    const operation = original?.id ?? uuid(originalOperation.value)
    await query(
      operation,
      () => client.operation(issuance, operation),
      (value) => {
        candidate.value = value ?? undefined
        if (value) {
          chain.value = ''
          reviewed.value = false
        }
      },
      (value) => value !== null,
    )
  } catch {
    failure.value = 'invalidRequest'
  }
}
watch(failure, (value) => {
  if (value === 'denied') {
    candidate.value = undefined
    grant.value = undefined
    returnedIssuance.value = undefined
  }
})
</script>
<template>
  <v-card :title="t(`security.recovery.${kind}`)"
    ><v-card-text>
      <v-alert type="info" variant="tonal" class="mb-4">{{
        t('security.recovery.noQueue')
      }}</v-alert>
      <p class="mb-4">
        {{ t(kind === 'registration' ? 'security.recovery.grantHint' : 'security.pki.issuedHint') }}
      </p>
      <OperationNotice
        :operation="pending"
        :busy="busy"
        :can-write="canWrite"
        :query-supported="kind === 'issuance'"
        :compare-supported="false"
        @query="lookup"
        @retry="recover(true)"
      />
      <v-alert v-if="pending?.state === 'conflict'" type="warning" variant="tonal" class="my-3">{{
        t('security.recovery.conflictHandoff')
      }}</v-alert>
      <form @submit.prevent="recover()">
        <fieldset :disabled="busy || !canWrite || locked" class="security-fieldset">
          <v-text-field
            :id="'agent-' + kind"
            v-model="locator"
            :label="
              t(
                kind === 'registration'
                  ? 'security.recovery.registrationId'
                  : 'security.recovery.issuanceId',
              )
            "
            required
            maxlength="36"
            :readonly="kind === 'registration' && !!registration"
            :disabled="busy || !canWrite || locked"
            @update:model-value="reviewed = false"
          />
          <v-text-field
            id="agent-recovery-operation"
            v-model="originalOperation"
            :label="t('security.recovery.administrativeOperation')"
            required
            maxlength="36"
            :disabled="busy || !canWrite || locked"
            @update:model-value="reviewed = false"
          />
          <template v-if="kind === 'registration'">
            <v-select
              v-model="platform"
              :label="t('security.recovery.platform')"
              :items="[
                { value: 'windows', title: 'Windows' },
                { value: 'macos', title: 'macOS' },
              ]"
              :disabled="busy || !canWrite || locked || !!props.platform"
              @update:model-value="reviewed = false"
            />
            <v-text-field
              id="agent-recovery-secret"
              v-model="secret"
              :label="t('security.recovery.secret')"
              type="password"
              required
              maxlength="43"
              autocomplete="off"
              :disabled="busy || !canWrite || locked"
              @update:model-value="reviewed = false"
            />
            <v-textarea
              id="agent-recovery-csr"
              v-model="csr"
              :label="t('security.recovery.csr')"
              required
              maxlength="43692"
              spellcheck="false"
              :disabled="busy || !canWrite || locked"
              @update:model-value="reviewed = false"
            />
          </template>
          <v-textarea
            v-else
            id="agent-recovery-chain"
            v-model="chain"
            :label="t('security.recovery.publicChain')"
            required
            maxlength="180000"
            spellcheck="false"
            :disabled="busy || !canWrite || locked"
            @update:model-value="reviewed = false"
          />
          <v-alert v-if="reviewed" type="warning" variant="tonal" class="mb-4"
            >{{ t('security.recovery.confirm') }} · {{ locator }} · {{ originalOperation }}</v-alert
          >
          <v-btn type="submit" :disabled="locked || !canWrite">{{
            t(reviewed ? 'security.recovery.continue' : 'security.pki.review')
          }}</v-btn>
        </fieldset>
      </form>
      <v-btn
        v-if="kind === 'issuance'"
        variant="tonal"
        class="mt-3"
        :disabled="busy"
        @click="lookup"
        >{{ t('settings.queryOperation') }}</v-btn
      >
      <v-alert v-if="failure" type="error" variant="tonal" class="mt-3">{{
        t('devices.' + failure)
      }}</v-alert>
      <v-alert v-if="returnedIssuance" type="info" variant="tonal" class="mt-3"
        >{{ t('security.recovery.issuanceId') }} · {{ returnedIssuance }}</v-alert
      >
      <v-table v-if="grant" class="mt-4"
        ><tbody>
          <tr>
            <th>{{ t('security.recovery.grant') }}</th>
            <td>{{ grant.grantId }}</td>
          </tr>
          <tr>
            <th>{{ t('settings.state') }}</th>
            <td>{{ t(`security.recovery.${grant.state}`) }}</td>
          </tr>
          <tr>
            <th>{{ t('security.recovery.deadline') }}</th>
            <td>{{ auditTime(grant.expiresAt) }}</td>
          </tr>
          <tr>
            <th>{{ t('security.recovery.platform') }}</th>
            <td>{{ grant.platform }}</td>
          </tr>
        </tbody></v-table
      >
      <template v-if="candidate"
        ><v-alert type="info" variant="tonal" class="mt-4">{{
          t('security.recovery.candidateHint')
        }}</v-alert
        ><v-table
          ><tbody>
            <tr>
              <th>{{ t('security.recovery.issuanceId') }}</th>
              <td>{{ candidate.issuanceId }}</td>
            </tr>
            <tr>
              <th>{{ t('security.recovery.originalSigningOperation') }}</th>
              <td>{{ candidate.operationId }}</td>
            </tr>
            <tr>
              <th>{{ t('security.recovery.deadline') }}</th>
              <td>{{ auditTime(candidate.activateBefore) }}</td>
            </tr>
          </tbody></v-table
        ></template
      >
    </v-card-text></v-card
  >
</template>

<style scoped>
.security-fieldset {
  border: 0;
  min-width: 0;
  padding: 0;
}
</style>
