<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
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
  <section class="console-panel">
    <h2>{{ t('settings.queryOperation') }}</h2>
    <p>{{ t('settings.retryHint') }}</p>
    <form class="settings-form" @submit.prevent="lookup">
      <label
        >{{ t('settings.domain')
        }}<select v-model="domain" @change="result = undefined">
          <option v-for="d in domains" :key="d" :value="d">{{ d }}</option>
        </select></label
      ><label>{{ t('settings.queryId') }}<input v-model="id" required maxlength="36" /></label
      ><UiButton type="submit" :disabled="busy">{{ t('settings.queryOperation') }}</UiButton>
    </form>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <p v-if="result" role="status">
      {{ t('settings.revision') }} {{ result.revision }} · {{ result.state }} ·
      {{ t('settings.notObserved') }}
    </p>
    <p v-if="result === null" role="status">{{ t('settings.connections.noReceipt') }}</p>
  </section>
  <p v-if="!records.length">{{ t('settings.noOperations') }}</p>
  <article v-for="operation in records" :key="operation.id" class="console-panel">
    <h2>{{ operation.target }} · {{ operation.action }}</h2>
    <p>
      {{ t('settings.operationId') }} <code>{{ operation.id }}</code> ·
      {{ t('settings.status.' + operation.state) }}
    </p>
    <RouterLink
      v-if="settingsDestination(operation.target, runtime.tenant)"
      :to="settingsDestination(operation.target, runtime.tenant)!"
      >{{ t('settings.open') }}</RouterLink
    ><span v-else>{{ t('settings.notSupported') }}</span>
  </article>
</template>
