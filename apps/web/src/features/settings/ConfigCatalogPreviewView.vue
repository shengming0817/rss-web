<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ModalShell, SourceBadge } from '@rss/core'
import { queryConfigCatalogPreview, type ConfigCatalogPreviewRow } from '@rss/settings/preview'
import { useConfigCatalogDraftHandoff } from './config-catalog-draft-context'

const { t } = useI18n()
const router = useRouter()
const handoff = useConfigCatalogDraftHandoff()
const search = ref('')
const prefix = ref('')
const page = ref(1)
const candidate = ref<ConfigCatalogPreviewRow>()
const result = computed(() =>
  queryConfigCatalogPreview({ search: search.value, prefix: prefix.value, page: page.value }),
)

watch([search, prefix], () => (page.value = 1))

function propose(row: ConfigCatalogPreviewRow) {
  candidate.value = row
}

function close() {
  candidate.value = undefined
}

async function confirm() {
  const selected = candidate.value
  if (selected === undefined || !handoff.stage(selected.key)) return
  candidate.value = undefined
  await router.push({ name: 'settings' })
}
</script>

<template>
  <section class="catalog-preview" aria-labelledby="catalog-preview-title">
    <header>
      <h1 id="catalog-preview-title" class="v1-h1">{{ t('configCatalogPreview.title') }}</h1>
      <p class="v1-sub">{{ t('configCatalogPreview.subtitle') }}</p>
    </header>
    <p role="alert">{{ t('configCatalogPreview.warning') }}</p>
    <div class="catalog-preview__filters">
      <label for="catalog-search">{{ t('configCatalogPreview.search') }}</label>
      <input id="catalog-search" v-model="search" type="search" />
      <label for="catalog-prefix">{{ t('configCatalogPreview.prefix') }}</label>
      <input id="catalog-prefix" v-model="prefix" />
    </div>
    <p>{{ t('configCatalogPreview.localPage', { page: result.page }) }}</p>
    <ul class="catalog-preview__rows">
      <li v-for="row in result.rows" :key="row.key">
        <div>
          <code>{{ row.key }}</code> — {{ row.label }}
        </div>
        <SourceBadge :source="row.source" />
        <button type="button" class="v1-btn" @click="propose(row)">
          {{ t('configCatalogPreview.copy') }}
        </button>
      </li>
    </ul>
    <p v-if="result.rows.length === 0">{{ t('configCatalogPreview.empty') }}</p>
    <div class="catalog-preview__pagination">
      <button type="button" class="v1-ghost" :disabled="page === 1" @click="page--">
        {{ t('configCatalogPreview.previous') }}
      </button>
      <button type="button" class="v1-ghost" :disabled="!result.hasMore" @click="page++">
        {{ t('configCatalogPreview.next') }}
      </button>
    </div>
    <ModalShell
      :open="candidate !== undefined"
      role="alertdialog"
      title-id="catalog-copy-title"
      description-id="catalog-copy-description"
      @close="close"
    >
      <h2 id="catalog-copy-title">{{ t('configCatalogPreview.confirmTitle') }}</h2>
      <p id="catalog-copy-description">
        {{ t('configCatalogPreview.confirmDescription', { key: candidate?.key }) }}
      </p>
      <div class="catalog-preview__actions">
        <button type="button" class="v1-ghost" @click="close">
          {{ t('configCatalogPreview.cancel') }}
        </button>
        <button type="button" class="v1-btn" data-action="confirm-catalog-copy" @click="confirm">
          {{ t('configCatalogPreview.confirm') }}
        </button>
      </div>
    </ModalShell>
  </section>
</template>

<style scoped>
.catalog-preview {
  display: grid;
  gap: 20px;
  max-width: 920px;
  padding: 32px;
}
.catalog-preview__filters {
  display: grid;
  gap: 8px;
}
.catalog-preview__filters input {
  min-height: 42px;
  padding: 8px 10px;
}
.catalog-preview__rows {
  display: grid;
  gap: 12px;
  padding: 0;
  list-style: none;
}
.catalog-preview__rows li {
  display: grid;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
}
.catalog-preview__pagination,
.catalog-preview__actions {
  display: flex;
  gap: 12px;
}
</style>
