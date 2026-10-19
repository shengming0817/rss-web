<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton, UiMessage } from '@rss/core/components'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsFacts, useSettingsAction } from '../useSettingsAction'
import {
  pkiPurposes,
  pkiTrust,
  encoded,
  type PkiPurpose,
  type PkiTrust,
  type Publication,
} from '../clients/pki'
import { array, closed, string, uuid } from '../../../services/decode'
import { inputDigest } from '../clients/value'
import { downloadPublic } from '../download'
import OperationNotice from './OperationNotice.vue'
import ObservationPanel from './ObservationPanel.vue'
const runtime = useMdm(),
  { t } = useI18n(),
  client = runtime.settings.pki
const { canRead, canWrite } = usePermission('credentials', 'credentials')
const { run, busy, failure, pending, locked, submit, resolveConflict, compared, markCompared } =
  useSettingsAction(() => 'pki')
const purpose = ref<PkiPurpose>('agent'),
  trust = ref<PkiTrust>(),
  candidate = ref<PkiTrust>(),
  revision = ref(0),
  publications = ref<Publication[]>(),
  attempt = ref(''),
  chain = ref(''),
  receipt = ref(''),
  rotationId = ref('')
async function load() {
  trust.value = undefined
  return run(
    () => client.read(purpose.value),
    (v) => {
      trust.value = v
      revision.value = v.revision
    },
  )
}
async function compare() {
  if (await load()) markCompared()
}
async function file(event: Event, kind: 'trust' | 'crl') {
  const input = event.target as HTMLInputElement,
    selected = input.files?.[0]
  input.value = ''
  candidate.value = undefined
  publications.value = undefined
  if (!selected) return
  if (selected.size > 24 * 1024 * 1024) {
    failure.value = 'requestTooLarge'
    return
  }
  const selectedPurpose = purpose.value
  await run(
    async () => JSON.parse(await selected.text()) as unknown,
    (value) => {
      if (kind === 'trust') candidate.value = pkiTrust(value, runtime.tenant, selectedPurpose)
      else
        publications.value = array(value, (v) => {
          const p = closed(v, ['issuer', 'crl', 'root_crl'])
          return {
            issuer: string(p['issuer']),
            crl: encoded(p['crl']),
            root_crl: encoded(p['root_crl']),
          }
        })
    },
  )
}
async function change(action: 'prepare' | 'approve' | 'activate' | 'retire' | 'crl' | 'recover') {
  if (!canWrite.value) return
  const expected = revision.value,
    selected = purpose.value
  if (action === 'prepare') {
    const input = candidate.value
    if (!input) return
    await submit(
      action,
      expected,
      { purpose: selected, candidateSha256: inputDigest(JSON.stringify(input)) },
      (id) => client.prepare(id, selected, expected, input),
      applyRotation,
    )
  } else if (action === 'crl') {
    const input = publications.value
    if (!input) return
    await submit(
      action,
      expected,
      { purpose: selected, publicationsSha256: inputDigest(JSON.stringify(input)) },
      (id) => client.publish(id, selected, input),
      () => (receipt.value = t('settings.accepted')),
    )
  } else if (action === 'recover') {
    let original: string, input: string[]
    try {
      original = uuid(attempt.value)
      input = chain.value
        .trim()
        .split(/\s+/)
        .map((v) => encoded(v, 45000))
    } catch {
      failure.value = 'invalidRequest'
      return
    }
    await submit(
      action,
      expected,
      { attempt: original, chainSha256: inputDigest(JSON.stringify(input)) },
      (id) => client.recover(id, original, input),
      (v) => (receipt.value = v.fingerprint),
    )
  } else {
    let original: string
    try {
      original = uuid(rotationId.value)
    } catch {
      failure.value = 'invalidRequest'
      return
    }
    await submit(
      action,
      expected,
      { purpose: selected, rotation: original },
      (id) => client.transition(id, selected, expected, action),
      applyRotation,
      false,
      original,
    )
  }
}
function applyRotation(value: { operation: string; revision: number; state: string }) {
  rotationId.value = value.operation
  revision.value = value.revision
  receipt.value = value.state
  queueMicrotask(() => void load())
}
function selectPurpose() {
  rotationId.value = ''
  candidate.value = undefined
  publications.value = undefined
  void load()
}
onMounted(load)
useSettingsFacts(() => {
  trust.value = undefined
  candidate.value = undefined
  publications.value = undefined
  receipt.value = ''
  rotationId.value = ''
})
</script>
<template>
  <UiMessage tone="info" :title="t('settings.trustHint')" />
  <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
  <p v-if="receipt" role="status">{{ receipt }}</p>
  <OperationNotice
    :operation="pending"
    :busy="busy"
    :can-write="canWrite"
    :query-supported="false"
    :compared="compared"
    @compare="compare"
    @edit="resolveConflict"
  />
  <label class="settings-form"
    >{{ t('settings.pkiPurpose')
    }}<select v-model="purpose" :disabled="locked" @change="selectPurpose">
      <option v-for="p in pkiPurposes" :key="p" :value="p">{{ p }}</option>
    </select></label
  >
  <UiButton :disabled="busy || !canRead" @click="load">{{ t('settings.reload') }}</UiButton>
  <article v-if="trust" class="console-panel">
    <p>{{ t('settings.savedVersion') }} {{ trust.revision }} · {{ trust.origin }}</p>
    <ul>
      <li v-for="issuer in trust.issuers" :key="issuer.digest">
        <code>{{ issuer.digest }}</code> · {{ issuer.mode }}
      </li>
    </ul>
    <UiButton @click="downloadPublic(purpose + '-trust.json', JSON.stringify(trust))">{{
      t('settings.publicCertificate')
    }}</UiButton>
  </article>
  <label class="settings-form"
    >{{ t('settings.rotationId')
    }}<input
      v-model="rotationId"
      maxlength="36"
      :disabled="locked"
      :placeholder="t('settings.queryId')"
  /></label>
  <form class="settings-form" @submit.prevent="change('prepare')">
    <fieldset :disabled="locked || !canWrite || !trust">
      <legend>{{ t('settings.import') }}</legend>
      <label
        >{{ t('settings.publicTrustFile')
        }}<input type="file" accept="application/json,.json" @change="file($event, 'trust')"
      /></label>
      <p v-if="candidate">
        {{ candidate.purpose }} · {{ candidate.revision }} ·
        {{ candidate.issuers.map((i) => i.digest).join(', ') }}
      </p>
      <UiButton type="submit" :disabled="!candidate">{{ t('settings.import') }}</UiButton>
      <div class="settings-actions">
        <UiButton @click="change('approve')">{{ t('settings.approve') }}</UiButton
        ><UiButton @click="change('activate')">{{ t('settings.activate') }}</UiButton
        ><UiButton @click="change('retire')">{{ t('settings.retire') }}</UiButton>
      </div>
    </fieldset>
  </form>
  <form class="settings-form" @submit.prevent="change('crl')">
    <fieldset :disabled="locked || !canWrite">
      <legend>{{ t('settings.publishCrl') }}</legend>
      <label
        >{{ t('settings.crlFile')
        }}<input type="file" accept="application/json,.json" @change="file($event, 'crl')" /></label
      ><UiButton type="submit" :disabled="!publications?.length">{{
        t('settings.publishCrl')
      }}</UiButton>
    </fieldset>
  </form>
  <form class="settings-form" @submit.prevent="change('recover')">
    <fieldset :disabled="locked || !canWrite">
      <legend>{{ t('settings.recoverSigning') }}</legend>
      <label
        >{{ t('settings.signingAttempt')
        }}<input v-model="attempt" required maxlength="36" /></label
      ><label
        >{{ t('settings.recoveryChain')
        }}<textarea v-model="chain" required maxlength="180000" spellcheck="false" /></label
      ><UiButton type="submit">{{ t('settings.recoverSigning') }}</UiButton>
    </fieldset>
  </form>
  <ObservationPanel kind="pki" />
</template>
