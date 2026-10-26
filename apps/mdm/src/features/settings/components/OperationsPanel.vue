<script setup lang="ts">
import '../settings.css'
import { VBtn, VCard, VForm, VSelect, VTextField } from 'vuetify/components'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useSettingsFacts, useSettingsAction } from '../useSettingsAction'
import { settingsDestination } from '../destinations'
const runtime = useMdm(),
  { t } = useI18n(),
  domain = ref(runtime.realm === 'platform' ? 'provision' : 'apns'),
  id = ref(''),
  result = ref<{ revision: number; state: string } | null>()
const domains = computed(() =>
  runtime.realm === 'platform'
    ? ['provision', 'registry']
    : [
        'apns',
        'profile',
        'managed_account',
        'storage',
        'smtp',
        'wns',
        'webhook',
        'task',
        'connections',
      ],
)
const { query, busy, failure } = useSettingsAction(() => domain.value)
const records = computed(() => [...runtime.settings.operations.records.values()])
async function lookup() {
  result.value = undefined
  await query(
    id.value,
    async () => {
      const s = runtime.settings,
        d = domain.value,
        original = id.value
      if (d === 'provision') {
        const v = await s.platform.operation(original)
        return { revision: v.result.revision, state: v.result.phase }
      }
      if (d === 'registry') {
        const v = await s.platform.registryOperation(original)
        return {
          revision: 'revision' in v.result ? v.result.revision : v.result.ruleRevision,
          state: v.action,
        }
      }
      if (d === 'apns' || d === 'profile' || d === 'managed_account') {
        const v = await s.apple.operation(original)
        return { revision: v.revision, state: v.state }
      }
      if (d === 'storage') {
        const v = await s.storage.operation(original)
        return { revision: v.revision, state: v.state }
      }
      if (d === 'smtp') {
        const v = await s.mail.operation(original)
        return { revision: v.revision, state: v.state }
      }
      if (d === 'wns') {
        const v = await s.wns.operation(original)
        return { revision: v.receipt.revision, state: v.kind }
      }
      if (d === 'webhook') {
        const v = await s.webhook.operation(original)
        return {
          revision: v.revision,
          state: 'confirmed' in v ? (v.confirmed ? 'qualified' : 'pending') : 'received',
        }
      }
      if (d === 'connections') {
        const v = await s.connections.operation(original)
        return v === null
          ? null
          : {
              revision:
                v.action === 'saved'
                  ? v.draft.configuration.revision
                  : v.configuration.configuration.revision,
              state: v.action,
            }
      }
      const v = await s.task.operation(original)
      return { revision: v.revision, state: 'received' }
    },
    (v) => (result.value = v),
    (v) => v !== null,
  )
}
useSettingsFacts(() => {
  result.value = undefined
})
</script>
<template>
  <VCard class="console-panel" tag="section" variant="outlined"
    ><h2>{{ t('settings.queryOperation') }}</h2>
    <p>{{ t('settings.retryHint') }}</p>
    <VForm class="settings-editor" @submit.prevent="lookup"
      ><VSelect
        v-model="domain"
        :label="t('settings.domain')"
        :items="[
          ...(domains ?? []).map((d) => ({ title: d, value: d, props: { disabled: false } })),
        ]"
        @update:model-value="result = undefined"
      /><VTextField v-model="id" required maxlength="36" :label="t('settings.queryId')" /><VBtn
        type="submit"
        :disabled="busy"
        >{{ t('settings.queryOperation') }}</VBtn
      ></VForm
    >
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <p v-if="result" role="status">
      {{ t('settings.revision') }} {{ result.revision }} · {{ result.state }} ·
      {{ t('settings.notObserved') }}
    </p>
    <p v-if="result === null" role="status">{{ t('settings.connections.noReceipt') }}</p></VCard
  >
  <p v-if="!records.length">{{ t('settings.noOperations') }}</p>
  <VCard
    v-for="operation in records"
    :key="operation.id"
    class="console-panel"
    tag="article"
    variant="outlined"
    ><h2>{{ operation.target }} · {{ operation.action }}</h2>
    <p>
      {{ t('settings.operationId') }} <code>{{ operation.id }}</code> ·
      {{ t('settings.status.' + operation.state) }}
    </p>
    <VBtn
      v-if="settingsDestination(operation.target, runtime.tenant)"
      :to="settingsDestination(operation.target, runtime.tenant)!"
      variant="text"
      >{{ t('settings.open') }}</VBtn
    ><span v-else>{{ t('settings.notSupported') }}</span></VCard
  >
</template>
