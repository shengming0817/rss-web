<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ErrorPage, ModalShell, SourceBadge } from '@rss/core'
import { MANUAL_SOURCE, RSS_SOURCE, UNAVAILABLE_SOURCE } from '@rss/shared'
import { toSafeErrorPresentation, toSafeReadErrorPresentation } from '../../errors/rss-error'
import { useAuthorizationIntent } from '../authorization/authorization-context'
import { createConfigOperation, type ConfigOperationState } from './config-operation'
import {
  CONFIG_DELETE_INTENT,
  CONFIG_GET_INTENT,
  CONFIG_PUBLISH_INTENT,
  CONFIG_ROLLBACK_INTENT,
} from './config-intent'
import { useSettingsApi } from './settings-context'
import type { ConfigPreviewDraftHandoff } from './config-preview-draft-context'

const props = defineProps<{ readonly configPreviewDraft?: ConfigPreviewDraftHandoff }>()
const { t } = useI18n()
const api = useSettingsApi()
const readAuthorization = useAuthorizationIntent(CONFIG_GET_INTENT)
const publishAuthorization = useAuthorizationIntent(CONFIG_PUBLISH_INTENT)
const deleteAuthorization = useAuthorizationIntent(CONFIG_DELETE_INTENT)
const rollbackAuthorization = useAuthorizationIntent(CONFIG_ROLLBACK_INTENT)
const keyInput = ref('')
const previewDraft = props.configPreviewDraft?.consume()
if (previewDraft !== undefined) keyInput.value = previewDraft.key
const valueInput = ref('')
const rollbackVersionInput = ref('')
if (previewDraft?.kind === 'history-rollback') {
  rollbackVersionInput.value = String(previewDraft.toVersion)
}
const revealValue = ref(false)
const attempted = ref(false)
const rollbackAttempted = ref(false)
const keyField = ref<HTMLInputElement>()
const rollbackVersionField = ref<HTMLInputElement>()
const panelHeading = ref<HTMLElement>()
const busyStatus = ref<HTMLElement>()

const operation = createConfigOperation({
  get: (key, options) => readAuthorization.execute(() => api.get(key, options)),
  publish: (request, options) => publishAuthorization.execute(() => api.publish(request, options)),
  delete: (key, options) => deleteAuthorization.execute(() => api.delete(key, options)),
  rollback: (key, request, options) =>
    rollbackAuthorization.execute(() => api.rollback(key, request, options)),
})
const state = shallowRef<ConfigOperationState>(operation.getState())
const unsubscribe = operation.subscribe((next) => {
  state.value = next
  if (
    next.status === 'ready' ||
    next.status === 'published' ||
    next.status === 'deleted' ||
    next.status === 'rolled-back' ||
    next.status === 'error' ||
    next.status === 'unknown'
  ) {
    void nextTick(() => panelHeading.value?.focus())
  }
  if (
    next.status === 'publishing' ||
    next.status === 'deleting' ||
    next.status === 'rolling-back' ||
    next.status === 'reading'
  ) {
    void nextTick(() => busyStatus.value?.focus())
  }
})

const key = computed(() => keyInput.value)
const invalidKey = computed(() => attempted.value && key.value.length === 0)
const rollbackVersion = computed(() => {
  if (!/^[1-9]\d*$/.test(rollbackVersionInput.value)) return undefined
  const parsed = Number(rollbackVersionInput.value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
})
const invalidRollbackVersion = computed(
  () => rollbackAttempted.value && rollbackVersion.value === undefined,
)
const busy = computed(() =>
  ['reading', 'publishing', 'deleting', 'rolling-back'].includes(state.value.status),
)
const reconciliationRequired = computed(() => state.value.status === 'unknown')
const controlsLocked = computed(() => busy.value || reconciliationRequired.value)
const error = computed(() => {
  const current = state.value
  if (current.status !== 'error' && current.status !== 'unknown') return undefined
  return current.status === 'error' && current.action === 'read'
    ? toSafeReadErrorPresentation(current.error)
    : toSafeErrorPresentation(current.error)
})
const confirmation = computed(() =>
  state.value.status === 'confirming-publish' ||
  state.value.status === 'confirming-delete' ||
  state.value.status === 'confirming-rollback'
    ? state.value
    : undefined,
)
const confirmationDescription = computed(() => {
  const current = confirmation.value
  if (!current) return ''
  switch (current.status) {
    case 'confirming-publish':
      return t('settingsConfig.confirmPublish', { key: current.key })
    case 'confirming-delete':
      return t('settingsConfig.confirmDelete', { key: current.key })
    case 'confirming-rollback':
      return t('settingsConfig.confirmRollback', {
        key: current.key,
        toVersion: current.toVersion,
      })
  }
  return ''
})

watch(keyInput, () => {
  if (reconciliationRequired.value) return
  attempted.value = false
  rollbackAttempted.value = false
  revealValue.value = false
  operation.reset()
})

function validateKey(): boolean {
  attempted.value = true
  if (key.value.length > 0) return true
  void nextTick(() => keyField.value?.focus())
  return false
}

function read() {
  if (!validateKey() || busy.value) return
  revealValue.value = false
  void operation.read(key.value)
}

function beginPublish() {
  if (!validateKey() || busy.value) return
  operation.beginPublish(key.value)
}

function confirmPublish() {
  const value = valueInput.value
  valueInput.value = ''
  void operation.confirmPublish(value)
}

function beginDelete() {
  if (!validateKey() || busy.value) return
  operation.beginDelete(key.value)
}

function beginRollback() {
  rollbackAttempted.value = true
  if (!validateKey() || busy.value) return
  if (rollbackVersion.value === undefined) {
    void nextTick(() => rollbackVersionField.value?.focus())
    return
  }
  operation.beginRollback(key.value, rollbackVersion.value)
}

function closeConfirmation() {
  const current = confirmation.value
  if (!current) return
  switch (current.status) {
    case 'confirming-publish':
      operation.cancelPublish()
      break
    case 'confirming-delete':
      operation.cancelDelete()
      break
    case 'confirming-rollback':
      operation.cancelRollback()
  }
}

function confirmOperation() {
  const current = confirmation.value
  if (!current) return
  switch (current.status) {
    case 'confirming-publish':
      confirmPublish()
      break
    case 'confirming-delete':
      void operation.confirmDelete()
      break
    case 'confirming-rollback':
      void operation.confirmRollback()
  }
}

function reconcile() {
  if (state.value.status !== 'unknown') return
  revealValue.value = false
  void operation.read(state.value.key)
}

onBeforeUnmount(() => {
  unsubscribe()
  operation.dispose()
  valueInput.value = ''
  revealValue.value = false
})
</script>

<template>
  <section class="config-page" aria-labelledby="config-title">
    <header>
      <h1 id="config-title" class="v1-h1">{{ t('settingsConfig.title') }}</h1>
      <p class="v1-sub">{{ t('settingsConfig.subtitle') }}</p>
    </header>

    <section class="config-panel" aria-labelledby="config-operation-title">
      <header class="config-panel__header">
        <h2 id="config-operation-title" ref="panelHeading" tabindex="-1">
          {{ t('settingsConfig.operationTitle') }}
        </h2>
        <SourceBadge v-if="state.status === 'ready'" :source="RSS_SOURCE" />
        <SourceBadge
          v-else-if="state.status === 'error' || state.status === 'unknown'"
          :source="UNAVAILABLE_SOURCE"
        />
      </header>

      <div class="config-draft">
        <div class="config-panel__header">
          <h3>{{ t('settingsConfig.manualDraft') }}</h3>
          <SourceBadge :source="MANUAL_SOURCE" />
        </div>
        <p v-if="previewDraft" role="status" class="config-preview-draft-notice">
          {{
            t(
              previewDraft.kind === 'history-rollback'
                ? 'settingsConfig.historyDraftNotice'
                : 'settingsConfig.catalogDraftNotice',
            )
          }}
        </p>
        <label for="config-key">{{ t('settingsConfig.key') }}</label>
        <input
          id="config-key"
          ref="keyField"
          v-model="keyInput"
          autocomplete="off"
          spellcheck="false"
          :disabled="controlsLocked"
          :aria-invalid="invalidKey"
          aria-describedby="config-key-hint"
        />
        <p id="config-key-hint">{{ t('settingsConfig.keyHint') }}</p>
        <p v-if="invalidKey" role="alert">{{ t('settingsConfig.keyRequired') }}</p>
        <label for="config-value">{{ t('settingsConfig.value') }}</label>
        <textarea
          id="config-value"
          v-model="valueInput"
          :disabled="controlsLocked"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          aria-describedby="config-value-hint"
        />
        <p id="config-value-hint">{{ t('settingsConfig.valueHint') }}</p>
        <label for="config-rollback-version">{{ t('settingsConfig.rollbackVersion') }}</label>
        <input
          id="config-rollback-version"
          ref="rollbackVersionField"
          v-model="rollbackVersionInput"
          inputmode="numeric"
          autocomplete="off"
          spellcheck="false"
          :disabled="controlsLocked"
          :aria-invalid="invalidRollbackVersion"
          aria-describedby="config-rollback-version-hint"
        />
        <p id="config-rollback-version-hint">{{ t('settingsConfig.rollbackVersionHint') }}</p>
        <p v-if="invalidRollbackVersion" role="alert">
          {{ t('settingsConfig.rollbackVersionRequired') }}
        </p>
        <div class="config-actions">
          <button type="button" class="v1-btn" :disabled="controlsLocked" @click="read">
            {{ t('settingsConfig.read') }}
          </button>
          <button type="button" class="v1-btn" :disabled="controlsLocked" @click="beginPublish">
            {{ t('settingsConfig.preparePublish') }}
          </button>
          <button type="button" class="v1-ghost" :disabled="controlsLocked" @click="beginDelete">
            {{ t('settingsConfig.prepareDelete') }}
          </button>
          <button type="button" class="v1-ghost" :disabled="controlsLocked" @click="beginRollback">
            {{ t('settingsConfig.prepareRollback') }}
          </button>
        </div>
      </div>

      <p v-if="busy" ref="busyStatus" role="status" tabindex="-1" aria-live="polite">
        {{ t(`settingsConfig.${state.status}`) }}
      </p>

      <div v-if="state.status === 'ready'" class="config-result">
        <dl>
          <dt>{{ t('settingsConfig.key') }}</dt>
          <dd>{{ state.entry.key }}</dd>
          <dt>{{ t('settingsConfig.version') }}</dt>
          <dd>{{ state.entry.version }}</dd>
        </dl>
        <button type="button" class="v1-ghost" @click="revealValue = !revealValue">
          {{ t(revealValue ? 'settingsConfig.hideValue' : 'settingsConfig.revealValue') }}
        </button>
        <pre v-if="revealValue" class="config-value">{{ state.entry.value }}</pre>
      </div>

      <p v-if="state.status === 'published'" role="status">
        {{
          t('settingsConfig.published', {
            key: state.coordinate.key,
            version: state.coordinate.version,
          })
        }}
      </p>
      <p v-if="state.status === 'deleted'" role="status">
        {{ t('settingsConfig.deleted', { key: state.key }) }}
      </p>
      <p v-if="state.status === 'rolled-back'" role="status">
        {{
          t('settingsConfig.rolledBack', {
            key: state.receipt.key,
            sourceVersion: state.receipt.sourceVersion,
            version: state.receipt.version,
          })
        }}
      </p>
      <p v-if="state.status === 'unknown'" role="alert">
        {{
          t(
            state.action === 'rollback'
              ? 'settingsConfig.rollbackUnknown'
              : 'settingsConfig.publishUnknown',
          )
        }}
      </p>
      <ErrorPage
        v-if="error"
        :error="error"
        :heading-level="3"
        :show-recovery="false"
        role="alert"
      />
      <button v-if="state.status === 'unknown'" type="button" class="v1-btn" @click="reconcile">
        {{ t('settingsConfig.reconcile') }}
      </button>
    </section>

    <ModalShell
      :open="confirmation !== undefined"
      role="alertdialog"
      title-id="config-confirm-title"
      description-id="config-confirm-description"
      @close="closeConfirmation"
    >
      <h2 id="config-confirm-title">{{ t('settingsConfig.confirmTitle') }}</h2>
      <p id="config-confirm-description">{{ confirmationDescription }}</p>
      <div class="config-actions">
        <button type="button" class="v1-ghost" @click="closeConfirmation">
          {{ t('settingsConfig.cancel') }}
        </button>
        <button type="button" class="v1-btn" data-action="confirm-config" @click="confirmOperation">
          {{ t('settingsConfig.confirm') }}
        </button>
      </div>
    </ModalShell>
  </section>
</template>

<style scoped>
.config-page {
  display: grid;
  gap: 24px;
  max-width: 920px;
  padding: 32px;
}
.config-panel,
.config-draft {
  display: grid;
  gap: 12px;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--bg-raised);
}
.config-panel__header,
.config-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.config-page input,
.config-page textarea {
  min-height: 42px;
  padding: 8px 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  color: var(--fg);
  background: var(--bg);
}
.config-page textarea {
  min-height: 120px;
}
.config-result dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px 16px;
}
.config-result dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.config-value {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
