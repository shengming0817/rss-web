<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton, UiTable, UiBadge, UiDialog, UiStepIndicator } from '@rss/core/components'
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
function reviewPreparation() {
  const current = trust.value,
    next = candidate.value
  if (
    !current ||
    !next ||
    next.origin !== current.origin ||
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
async function file(event: Event) {
  const input = event.target as HTMLInputElement,
    selectedFile = input.files?.[0]
  input.value = ''
  candidate.value = undefined
  preparationReviewed.value = false
  if (!selectedFile) return
  if (selectedFile.size > 24 * 1024 * 1024) {
    failure.value = 'requestTooLarge'
    return
  }
  await run(
    async () => pkiTrust(JSON.parse(await selectedFile.text()), runtime.tenant, props.purpose),
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
  <section class="console-panel">
    <header class="console-inline-actions">
      <h2>{{ t('security.pki.trust') }}</h2>
      <UiButton :disabled="busy || !canRead" @click="load">{{ t('devices.reload') }}</UiButton
      ><UiButton
        :disabled="locked || !canWrite || !trust"
        @click="
          closePreparation()
          preparing = true
        "
        >{{ t('security.pki.prepare') }}</UiButton
      >
    </header>
    <p>{{ t('security.pki.publicHint') }}</p>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <OperationNotice
      :operation="pending"
      :busy="busy"
      :can-write="canWrite"
      :query-supported="false"
      :compared="compared"
      @compare="compare"
      @edit="resolveConflict"
    />
    <template v-if="trust">
      <p>
        {{ t('security.pki.revision') }} {{ trust.revision }} · {{ t('security.pki.origin') }}
        {{ trust.origin }}
        <span v-if="readAt">· {{ t('security.pki.readAt') }} {{ auditTime(readAt) }}</span>
      </p>
      <UiTable
        :label="t('security.pki.trust')"
        :rows="trust.issuers"
        :row-key="(v) => v.digest"
        :columns="[
          { key: 'digest', label: t('security.pki.issuer') },
          { key: 'mode', label: t('security.pki.mode') },
          { key: 'provisioner', label: t('security.pki.provider') },
        ]"
        :busy="busy"
        :busy-label="t('devices.loading')"
        :empty-label="t('devices.empty')"
      >
        <template #cell-digest="{ row }"
          ><UiButton variant="ghost" @click="selected = row"
            >{{ row.digest.slice(0, 16) }}…</UiButton
          ></template
        >
        <template #cell-mode="{ row }"
          ><UiBadge :tone="row.mode === 'active' ? 'success' : 'neutral'">{{
            t(`security.pki.${row.mode}`)
          }}</UiBadge></template
        >
      </UiTable>
      <UiButton
        variant="ghost"
        @click="downloadPublic(purpose + '-trust.json', JSON.stringify(trust))"
        >{{ t('security.pki.download') }}</UiButton
      >
    </template>
    <p v-else-if="!busy && !failure">{{ t('security.pki.noTrust') }}</p>
  </section>
  <section class="console-panel">
    <h2>{{ t('security.pki.lifecycle') }}</h2>
    <p>{{ t('security.pki.noRotationRead') }}</p>
    <p>{{ t('security.pki.rotationHint') }}</p>
    <UiButton
      :disabled="busy"
      @click="
        rotation = rotation || intentRotation || ''
        rotationOpen = true
      "
      >{{ t('security.pki.rotations') }}</UiButton
    >
  </section>
  <CrlPublisher :purpose="purpose" />
  <template v-if="purpose === 'agent'"
    ><p>{{ t('security.pki.observationHint') }}</p>
    <ObservationPanel kind="pki"
  /></template>
  <UiDialog
    :open="!!selected"
    placement="right"
    :title="t('security.pki.details')"
    :close-label="t('security.pki.close')"
    @update:open="selected = undefined"
  >
    <dl v-if="selected" class="settings-facts">
      <dt>{{ t('security.pki.issuer') }}</dt>
      <dd class="console-locator">{{ selected.digest }}</dd>
      <dt>{{ t('security.pki.mode') }}</dt>
      <dd>{{ t(`security.pki.${selected.mode}`) }}</dd>
      <dt>{{ t('security.pki.provisioner') }}</dt>
      <dd>{{ selected.provisioner }}</dd>
      <dt>{{ t('security.pki.kid') }}</dt>
      <dd>{{ selected.kid || '—' }}</dd>
    </dl>
  </UiDialog>
  <UiDialog
    :open="preparing"
    :dismissible="!busy"
    placement="right"
    :title="t('security.pki.material')"
    :close-label="t('security.pki.close')"
    @update:open="closePreparation"
  >
    <p>{{ t('security.pki.materialHint') }}</p>
    <p class="ui-help">{{ t('security.pki.unavailableMaterial') }}</p>
    <label for="pki-trust-file">{{ t('security.pki.upload') }}</label
    ><input
      id="pki-trust-file"
      type="file"
      accept="application/json,.json"
      :disabled="locked || !canWrite"
      @change="file"
    />
    <dl class="settings-facts">
      <dt>{{ t('security.pki.tenant') }}</dt>
      <dd>{{ runtime.tenant }}</dd>
      <dt>{{ t('security.pki.purpose') }}</dt>
      <dd>{{ t(`security.pki.${purpose}`) }}</dd>
      <dt>{{ t('security.pki.expected') }}</dt>
      <dd>{{ trust?.revision ?? '—' }}</dd>
      <dt>{{ t('security.pki.candidateRevision') }}</dt>
      <dd>{{ candidate?.revision ?? '—' }}</dd>
    </dl>
    <ul v-if="candidate">
      <li v-for="issuer in candidate.issuers" :key="issuer.digest">
        {{ issuer.digest }} · {{ t(`security.pki.${issuer.mode}`) }}
      </li>
    </ul>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <p v-if="pending?.state === 'unknown'" role="alert">{{ t('security.pki.unknown') }}</p>
    <template #footer>
      <UiButton
        v-if="!preparationReviewed"
        :disabled="locked || !canWrite || !candidate || !trust"
        @click="reviewPreparation"
        >{{ t('security.pki.review') }}</UiButton
      >
      <UiButton v-else :disabled="locked || !canWrite || !candidate || !trust" @click="prepare">{{
        t('security.pki.prepareConfirm')
      }}</UiButton>
    </template>
  </UiDialog>
  <UiDialog
    :open="rotationOpen"
    placement="right"
    :dismissible="!busy"
    :title="t('security.pki.rotations')"
    :close-label="t('security.pki.close')"
    @update:open="
      rotationOpen = false
      confirmation = undefined
    "
  >
    <p>{{ t('security.pki.stageHint') }}</p>
    <label for="pki-rotation">{{ t('security.pki.operation') }}</label
    ><input
      id="pki-rotation"
      v-model="rotation"
      maxlength="36"
      :disabled="locked"
      class="ui-input"
    />
    <p>{{ t('security.pki.expected') }} {{ trust?.revision ?? '—' }}</p>
    <UiStepIndicator
      v-if="receipt"
      :label="t('security.pki.receipt')"
      :current="stage"
      :steps="[
        t('security.pki.prepare'),
        t('security.pki.distributing'),
        t('security.pki.activated'),
        t('security.pki.retired'),
      ]"
    />
    <dl v-if="receipt" class="settings-facts">
      <dt>{{ t('security.pki.receipt') }}</dt>
      <dd>{{ t(`security.pki.${receipt.state}`) }}</dd>
      <dt>{{ t('security.pki.operation') }}</dt>
      <dd>{{ receipt.operation }}</dd>
      <dt>{{ t('security.pki.revision') }}</dt>
      <dd>{{ receipt.revision }}</dd>
    </dl>
    <p class="ui-help">{{ t('security.pki.noRotationRead') }}</p>
    <p v-if="failure" role="alert">
      {{ t(failure === 'conflict' ? 'security.pki.blocked' : 'devices.' + failure) }}
    </p>
    <p v-if="pending?.state === 'unknown'" role="alert">
      {{ t('security.pki.unknown') }} · {{ pending.id }}
    </p>
    <OperationNotice
      :operation="pending"
      :busy="busy"
      :can-write="canWrite"
      :query-supported="false"
      :compared="compared"
      @compare="compare"
      @edit="resolveConflict"
    />
    <p v-if="confirmation">
      <strong>{{ t(`security.pki.${confirmation}`) }}</strong> ·
      {{ t('security.pki.transitionConfirm') }}
    </p>
    <template #footer>
      <UiButton :disabled="busy || !canRead" @click="load">{{ t('devices.reload') }}</UiButton>
      <template v-if="!confirmation"
        ><UiButton
          :disabled="locked || !canWrite || !trust || !rotation"
          @click="confirmation = 'activate'"
          >{{ t('security.pki.activate') }}</UiButton
        ><UiButton
          :disabled="locked || !canWrite || !trust || !rotation"
          @click="confirmation = 'retire'"
          >{{ t('security.pki.retire') }}</UiButton
        ></template
      >
      <UiButton v-else :disabled="locked || !canWrite || !trust || !rotation" @click="transition">{{
        t('security.pki.transitionConfirm')
      }}</UiButton>
    </template>
  </UiDialog>
</template>
