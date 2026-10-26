<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { VAlert, VBtn } from 'vuetify/components'
import type { SettingsOperation } from '../operations'
withDefaults(
  defineProps<{
    operation?: SettingsOperation | undefined
    busy?: boolean
    canWrite?: boolean
    compareSupported?: boolean
    querySupported?: boolean
    compared?: boolean
  }>(),
  { querySupported: true, compareSupported: true },
)
defineEmits<{ query: []; retry: []; compare: []; edit: [] }>()
const { t } = useI18n()
</script>
<template>
  <VAlert
    v-if="operation"
    :type="operation.state === 'received' ? 'info' : 'warning'"
    variant="tonal"
    role="status"
    :title="
      t(
        operation.state === 'unknown'
          ? 'settings.unknownWrite'
          : operation.state === 'conflict'
            ? 'settings.conflict'
            : 'settings.accepted',
      )
    "
  >
    <p>
      {{ t('settings.operationId') }} <code>{{ operation.id }}</code> · {{ t('settings.revision') }}
      {{ operation.expectedRevision }}
    </p>
    <details v-if="operation.state === 'unknown'">
      <summary>{{ t('settings.publicInputs') }}</summary>
      <pre class="settings-public-input">{{ operation.publicInput }}</pre>
    </details>
    <p v-if="operation.state === 'unknown'">
      {{ t(querySupported === false ? 'settings.noOperationQuery' : 'settings.retryHint') }}
    </p>
    <div class="settings-actions">
      <VBtn v-if="querySupported !== false" :disabled="!!busy" @click="$emit('query')">{{
        t('settings.queryOperation')
      }}</VBtn>
      <VBtn
        v-if="operation.state === 'unknown' && querySupported !== false"
        :disabled="!!busy || !canWrite || !operation.queried"
        @click="$emit('retry')"
        >{{ t('settings.retryOriginal') }}</VBtn
      >
      <VBtn
        v-if="operation.state === 'conflict' && compareSupported !== false"
        :disabled="!!busy || !canWrite"
        @click="$emit('compare')"
        >{{ t('settings.readComparison') }}</VBtn
      >
      <VBtn
        v-if="operation.state === 'conflict' && compared"
        :disabled="!!busy || !canWrite"
        @click="$emit('edit')"
        >{{ t('settings.newAfterConflict') }}</VBtn
      >
    </div>
  </VAlert>
</template>
