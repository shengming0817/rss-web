<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ModalShell, SourceBadge } from '@rss/core'
import { CONFIG_HISTORY_PREVIEW_ROWS, type ConfigHistoryPreviewRow } from '@rss/settings/preview'
import type { ConfigPreviewDraftHandoff } from './config-preview-draft-context'

const props = defineProps<{ readonly configPreviewDraft: ConfigPreviewDraftHandoff }>()
const { t } = useI18n()
const router = useRouter()
const candidate = ref<ConfigHistoryPreviewRow>()
const handoffError = ref(false)
const handoffErrorAlert = ref<HTMLElement>()

function propose(row: ConfigHistoryPreviewRow) {
  handoffError.value = false
  candidate.value = row
}

function close() {
  props.configPreviewDraft.discard()
  handoffError.value = false
  candidate.value = undefined
}

async function confirm() {
  const selected = candidate.value
  if (selected === undefined) return
  if (!props.configPreviewDraft.stageHistory(selected)) {
    handoffError.value = true
    await nextTick()
    handoffErrorAlert.value?.focus()
    return
  }
  try {
    await router.push({ name: 'settings' })
    if (router.currentRoute.value.name === 'settings') {
      candidate.value = undefined
      return
    }
  } catch {
    // The reviewed coordinate is discarded below; raw navigation errors are not rendered.
  }
  props.configPreviewDraft.discard()
  handoffError.value = true
  await nextTick()
  handoffErrorAlert.value?.focus()
}
</script>

<template>
  <section class="history-preview" aria-labelledby="history-preview-title">
    <header>
      <h1 id="history-preview-title" class="v1-h1">{{ t('configHistoryPreview.title') }}</h1>
      <p class="v1-sub">{{ t('configHistoryPreview.subtitle') }}</p>
    </header>
    <p role="alert">{{ t('configHistoryPreview.warning') }}</p>
    <p role="status" aria-live="polite">
      {{ t('configHistoryPreview.localResult', { count: CONFIG_HISTORY_PREVIEW_ROWS.length }) }}
    </p>
    <ol class="history-preview__timeline">
      <li
        v-for="row in CONFIG_HISTORY_PREVIEW_ROWS"
        :key="`${row.key}:${row.version}`"
        data-history-row
      >
        <div>
          <code>{{ row.key }}</code>
          <span>{{ t('configHistoryPreview.version', { version: row.version }) }}</span>
        </div>
        <SourceBadge :source="row.source" />
        <button
          type="button"
          class="v1-btn"
          data-action="prepare-history-copy"
          @click="propose(row)"
        >
          {{ t('configHistoryPreview.copy') }}
        </button>
      </li>
    </ol>
    <ModalShell
      :open="candidate !== undefined"
      role="alertdialog"
      title-id="history-copy-title"
      description-id="history-copy-description"
      @close="close"
    >
      <h2 id="history-copy-title">{{ t('configHistoryPreview.confirmTitle') }}</h2>
      <p id="history-copy-description">
        {{
          t('configHistoryPreview.confirmDescription', {
            key: candidate?.key,
            version: candidate?.version,
          })
        }}
      </p>
      <p v-if="handoffError" ref="handoffErrorAlert" role="alert" tabindex="-1">
        {{ t('configHistoryPreview.handoffError') }}
      </p>
      <div class="history-preview__actions">
        <button type="button" class="v1-ghost" data-action="cancel-history-copy" @click="close">
          {{ t('configHistoryPreview.cancel') }}
        </button>
        <button type="button" class="v1-btn" data-action="confirm-history-copy" @click="confirm">
          {{ t('configHistoryPreview.confirm') }}
        </button>
      </div>
    </ModalShell>
  </section>
</template>

<style scoped>
.history-preview {
  display: grid;
  gap: 20px;
  max-width: 920px;
  padding: 32px;
}
.history-preview__timeline {
  display: grid;
  gap: 12px;
  padding-inline-start: 24px;
}
.history-preview__timeline li {
  display: grid;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
}
.history-preview__timeline li > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.history-preview__actions {
  display: flex;
  gap: 12px;
}
</style>
