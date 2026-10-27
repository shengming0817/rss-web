<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  VAlert,
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VChip,
  VDialog,
  VFileInput,
  VList,
  VListItem,
  VStepper,
  VTable,
  VTextField,
} from 'vuetify/components'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsAction, useSettingsFacts } from '../../settings/useSettingsAction'
import {
  pkiTrust,
  type PkiPurpose,
  type PkiTrust,
  type pkiReceipt,
} from '../../settings/clients/pki'
import { downloadPublic } from '../../settings/download'
import { auditTime } from '../../operations/format'
import { inputDigest } from '../../settings/clients/value'
import { uuid } from '../../../services/decode'
import CrlPublisher from './CrlPublisher.vue'
import ObservationPanel from '../../settings/components/ObservationPanel.vue'
import OperationNotice from '../../settings/components/OperationNotice.vue'
const props = defineProps<{ purpose: PkiPurpose }>()
const runtime = useMdm(),
  { t } = useI18n(),
  client = runtime.settings.pki,
  { canRead, canWrite } = usePermission('credentials', 'credentials'),
  { run, busy, failure, pending, locked, compared, markCompared, resolveConflict, submit } =
    useSettingsAction(() => `pki:${props.purpose}`)
const trust = ref<PkiTrust>(),
  readAt = ref<number>(),
  candidate = ref<PkiTrust>(),
  preparing = ref(false),
  selected = ref<PkiTrust['issuers'][number]>(),
  rotation = ref(''),
  rotationOpen = ref(false),
  preparationReviewed = ref(false),
  confirmation = ref<'activate' | 'retire'>(),
  receipt = ref<ReturnType<typeof pkiReceipt>>()
const intentRotation = computed(() =>
  ['prepare', 'activate', 'retire'].includes(pending.value?.action ?? '')
    ? pending.value?.id
    : undefined,
)
const stage = computed(() =>
  receipt.value ? ['distributing', 'activated', 'retired'].indexOf(receipt.value.state) + 1 : 0,
)
function closePreparation() {
  preparing.value = false
  candidate.value = undefined
  preparationReviewed.value = false
}
function openPreparation() {
  closePreparation()
  preparing.value = true
}
function openRotation() {
  rotation.value = rotation.value || intentRotation.value || ''
  rotationOpen.value = true
}
function closeRotation() {
  rotationOpen.value = false
  confirmation.value = undefined
}
function reviewPreparation() {
  const current = trust.value,
    next = candidate.value
  if (
    !current ||
    !next ||
    next.service_id !== current.service_id ||
    next.revision !== current.revision + 1 ||
    next.issuers.filter((i) => !current.issuers.some((old) => old.digest === i.digest)).length !==
      1 ||
    !next.issuers.some(
      (i) => i.mode === 'prepared' && !current.issuers.some((old) => old.digest === i.digest),
    )
  ) {
    failure.value = 'invalidRequest'
    return
  }
  preparationReviewed.value = true
}
async function prepare() {
  if (
    locked.value ||
    !canWrite.value ||
    !trust.value ||
    !candidate.value ||
    !preparationReviewed.value
  )
    return
  const input = candidate.value,
    expected = trust.value.revision
  await submit(
    'prepare',
    expected,
    { purpose: props.purpose, candidateSha256: inputDigest(JSON.stringify(input)) },
    (id) => client.prepare(id, props.purpose, expected, input),
    (value) => {
      receipt.value = value
      rotation.value = value.operation
      closePreparation()
      rotationOpen.value = true
    },
  )
  if (pending.value?.state === 'received') await load()
}
async function transition() {
  const action = confirmation.value
  if (!action || locked.value || !canWrite.value || !trust.value) return
  let id: string
  try {
    id = uuid(rotation.value || intentRotation.value)
  } catch {
    failure.value = 'invalidRequest'
    return
  }
  const expected = trust.value.revision
  const ok = await submit(
    action,
    expected,
    { purpose: props.purpose, rotation: id },
    (original) => client.transition(original, props.purpose, expected, action),
    (value) => {
      receipt.value = value
      rotation.value = value.operation
    },
    false,
    id,
  )
  if (ok) {
    confirmation.value = undefined
    await load()
  }
}
async function load() {
  trust.value = undefined
  selected.value = undefined
  readAt.value = undefined
  return run(
    () => client.read(props.purpose),
    (v) => {
      trust.value = v
      readAt.value = Math.floor(Date.now() / 1000)
    },
  )
}
async function compare() {
  if (await load()) markCompared()
}
async function file(selectedFile: File | File[] | null) {
  if (Array.isArray(selectedFile)) selectedFile = selectedFile[0] ?? null
  candidate.value = undefined
  preparationReviewed.value = false
  if (!selectedFile) return
  if (selectedFile.size > 24 * 1024 * 1024) {
    failure.value = 'requestTooLarge'
    return
  }
  await run(
    async () =>
      pkiTrust(
        JSON.parse(await selectedFile.text()),
        runtime.tenant,
        props.purpose,
        runtime.serviceId,
      ),
    (v) => {
      candidate.value = v
    },
  )
}
onMounted(load)
useSettingsFacts(() => {
  trust.value = undefined
  candidate.value = undefined
  selected.value = undefined
  closePreparation()
  receipt.value = undefined
  rotation.value = ''
  rotationOpen.value = false
  confirmation.value = undefined
  readAt.value = undefined
})
</script>
<template>
  <v-card :title="t('security.pki.trust')" class="mb-4"
    ><v-card-text>
      <div class="d-flex flex-wrap ga-3 mb-4">
        <v-btn variant="tonal" :disabled="busy || !canRead" @click="load">{{
          t('devices.reload')
        }}</v-btn
        ><v-btn :disabled="locked || !canWrite || !trust" @click="openPreparation">{{
          t('security.pki.prepare')
        }}</v-btn>
      </div>
      <v-alert type="info" variant="tonal" class="mb-3">{{ t('security.pki.publicHint') }}</v-alert
      ><v-alert v-if="failure" type="error" variant="tonal" class="mb-3">{{
        t('devices.' + failure)
      }}</v-alert>
      <OperationNotice
        :operation="pending"
        :busy="busy"
        :can-write="canWrite"
        :query-supported="false"
        :compared="compared"
        @compare="compare"
        @edit="resolveConflict"
      />
      <template v-if="trust"
        ><p class="my-3">
          {{ t('settings.connections.service') }} {{ trust.service_id }} ·
          {{ t('security.pki.revision') }} {{ trust.revision }} · {{ t('security.pki.origin') }}
          {{ trust.origin }}
          <span v-if="readAt">· {{ t('security.pki.readAt') }} {{ auditTime(readAt) }}</span>
        </p>
        <v-table :aria-label="t('security.pki.trust')"
          ><thead>
            <tr>
              <th>{{ t('security.pki.issuer') }}</th>
              <th>{{ t('security.pki.mode') }}</th>
              <th>{{ t('security.pki.provider') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="issuer in trust.issuers" :key="issuer.digest">
              <td>
                <v-btn variant="text" @click="selected = issuer"
                  >{{ issuer.digest.slice(0, 16) }}…</v-btn
                >
              </td>
              <td>
                <v-chip :color="issuer.mode === 'active' ? 'success' : undefined" size="small">{{
                  t(`security.pki.${issuer.mode}`)
                }}</v-chip>
              </td>
              <td>{{ issuer.provisioner }}</td>
            </tr>
          </tbody></v-table
        >
        <v-btn
          variant="text"
          class="mt-3"
          @click="downloadPublic(purpose + '-trust.json', JSON.stringify(trust))"
          >{{ t('security.pki.download') }}</v-btn
        > </template
      ><v-alert v-else-if="!busy && !failure" type="info" variant="tonal">{{
        t('security.pki.noTrust')
      }}</v-alert>
    </v-card-text></v-card
  >
  <v-card :title="t('security.pki.lifecycle')" class="mb-4"
    ><v-card-text
      ><p class="mb-3">{{ t('security.pki.noRotationRead') }}</p>
      <p class="mb-3">{{ t('security.pki.rotationHint') }}</p>
      <v-btn :disabled="busy" @click="openRotation">{{
        t('security.pki.rotations')
      }}</v-btn></v-card-text
    ></v-card
  >
  <CrlPublisher :purpose="purpose" />
  <template v-if="purpose === 'agent'"
    ><p class="my-4">{{ t('security.pki.observationHint') }}</p>
    <ObservationPanel kind="pki"
  /></template>
  <v-dialog
    :model-value="!!selected"
    max-width="680"
    :aria-label="t('security.pki.details')"
    @update:model-value="!$event && (selected = undefined)"
    ><v-card
      ><v-card-title>{{ t('security.pki.details') }}</v-card-title
      ><v-card-text
        ><v-table v-if="selected"
          ><tbody>
            <tr>
              <th>{{ t('security.pki.issuer') }}</th>
              <td class="text-break">{{ selected.digest }}</td>
            </tr>
            <tr>
              <th>{{ t('security.pki.mode') }}</th>
              <td>{{ t(`security.pki.${selected.mode}`) }}</td>
            </tr>
            <tr>
              <th>{{ t('security.pki.provisioner') }}</th>
              <td>{{ selected.provisioner }}</td>
            </tr>
            <tr>
              <th>{{ t('security.pki.kid') }}</th>
              <td>{{ selected.kid || '—' }}</td>
            </tr>
          </tbody></v-table
        ></v-card-text
      ><v-card-actions
        ><v-btn @click="selected = undefined">{{ t('security.pki.close') }}</v-btn></v-card-actions
      ></v-card
    ></v-dialog
  >
  <v-dialog
    :model-value="preparing"
    :persistent="busy"
    max-width="860"
    scrollable
    :aria-label="t('security.pki.material')"
    @update:model-value="!$event && closePreparation()"
    ><v-card
      ><v-card-title>{{ t('security.pki.material') }}</v-card-title
      ><v-card-text
        ><p class="mb-3">{{ t('security.pki.materialHint') }}</p>
        <v-alert type="info" variant="tonal" class="mb-4">{{
          t('security.pki.unavailableMaterial')
        }}</v-alert
        ><v-file-input
          id="pki-trust-file"
          :label="t('security.pki.upload')"
          accept="application/json,.json"
          :disabled="locked || !canWrite"
          @update:model-value="file"
        />
        <v-table
          ><tbody>
            <tr>
              <th>{{ t('security.pki.tenant') }}</th>
              <td>{{ runtime.tenant }}</td>
            </tr>
            <tr>
              <th>{{ t('security.pki.purpose') }}</th>
              <td>{{ t(`security.pki.${purpose}`) }}</td>
            </tr>
            <tr>
              <th>{{ t('security.pki.expected') }}</th>
              <td>{{ trust?.revision ?? '—' }}</td>
            </tr>
            <tr>
              <th>{{ t('security.pki.candidateRevision') }}</th>
              <td>{{ candidate?.revision ?? '—' }}</td>
            </tr>
          </tbody></v-table
        ><v-list v-if="candidate"
          ><v-list-item
            v-for="issuer in candidate.issuers"
            :key="issuer.digest"
            :title="issuer.digest"
            :subtitle="t(`security.pki.${issuer.mode}`)"
        /></v-list>
        <v-alert v-if="failure" type="error" variant="tonal">{{ t('devices.' + failure) }}</v-alert
        ><v-alert v-if="pending?.state === 'unknown'" type="warning" variant="tonal">{{
          t('security.pki.unknown')
        }}</v-alert> </v-card-text
      ><v-card-actions
        ><v-btn :disabled="busy" @click="closePreparation">{{ t('security.pki.close') }}</v-btn
        ><v-btn
          v-if="!preparationReviewed"
          :disabled="locked || !canWrite || !candidate || !trust"
          @click="reviewPreparation"
          >{{ t('security.pki.review') }}</v-btn
        ><v-btn v-else :disabled="locked || !canWrite || !candidate || !trust" @click="prepare">{{
          t('security.pki.prepareConfirm')
        }}</v-btn></v-card-actions
      ></v-card
    ></v-dialog
  >
  <v-dialog
    :model-value="rotationOpen"
    :persistent="busy"
    max-width="860"
    scrollable
    :aria-label="t('security.pki.rotations')"
    @update:model-value="!$event && closeRotation()"
    ><v-card
      ><v-card-title>{{ t('security.pki.rotations') }}</v-card-title
      ><v-card-text
        ><p class="mb-4">{{ t('security.pki.stageHint') }}</p>
        <v-text-field
          id="pki-rotation"
          v-model="rotation"
          maxlength="36"
          :disabled="locked"
          :label="t('security.pki.operation')"
        />
        <p class="mb-3">{{ t('security.pki.expected') }} {{ trust?.revision ?? '—' }}</p>
        <v-stepper
          v-if="receipt"
          :model-value="stage + 1"
          :items="[
            t('security.pki.prepare'),
            t('security.pki.distributing'),
            t('security.pki.activated'),
            t('security.pki.retired'),
          ]"
          hide-actions
          :alt-labels="true"
        />
        <v-table v-if="receipt" class="my-3"
          ><tbody>
            <tr>
              <th>{{ t('security.pki.receipt') }}</th>
              <td>{{ t(`security.pki.${receipt.state}`) }}</td>
            </tr>
            <tr>
              <th>{{ t('security.pki.operation') }}</th>
              <td>{{ receipt.operation }}</td>
            </tr>
            <tr>
              <th>{{ t('security.pki.revision') }}</th>
              <td>{{ receipt.revision }}</td>
            </tr>
          </tbody></v-table
        >
        <p class="mb-3">{{ t('security.pki.noRotationRead') }}</p>
        <v-alert v-if="failure" type="error" variant="tonal" class="my-3">{{
          t(failure === 'conflict' ? 'security.pki.blocked' : 'devices.' + failure)
        }}</v-alert
        ><v-alert v-if="pending?.state === 'unknown'" type="warning" variant="tonal" class="my-3"
          >{{ t('security.pki.unknown') }} · {{ pending.id }}</v-alert
        ><OperationNotice
          :operation="pending"
          :busy="busy"
          :can-write="canWrite"
          :query-supported="false"
          :compared="compared"
          @compare="compare"
          @edit="resolveConflict"
        /><v-alert v-if="confirmation" type="warning" variant="tonal" class="mt-4"
          >{{ t(`security.pki.${confirmation}`) }} ·
          {{ t('security.pki.transitionConfirm') }}</v-alert
        > </v-card-text
      ><v-card-actions class="flex-wrap"
        ><v-btn :disabled="busy" @click="closeRotation">{{ t('security.pki.close') }}</v-btn
        ><v-btn :disabled="busy || !canRead" @click="load">{{ t('devices.reload') }}</v-btn
        ><template v-if="!confirmation"
          ><v-btn
            :disabled="locked || !canWrite || !trust || !rotation"
            @click="confirmation = 'activate'"
            >{{ t('security.pki.activate') }}</v-btn
          ><v-btn
            :disabled="locked || !canWrite || !trust || !rotation"
            @click="confirmation = 'retire'"
            >{{ t('security.pki.retire') }}</v-btn
          ></template
        ><v-btn v-else :disabled="locked || !canWrite || !trust || !rotation" @click="transition">{{
          t('security.pki.transitionConfirm')
        }}</v-btn></v-card-actions
      ></v-card
    ></v-dialog
  >
</template>
