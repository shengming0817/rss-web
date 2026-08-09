<script setup lang="ts">
/**
 * ConfigView — /config configuration entries page.
 *
 * Stage/publish semantics: write/update = stage the edit (bumps version, backend stores it).
 * publish = publish a snapshot. UI subtitle clarifies: "Edits stage until you publish".
 *
 * Sensitive entries: list returns value="******"; UI shows it as a redacted placeholder
 * with a "sensitive" badge. The edit drawer leaves value blank for re-entry.
 *
 * Rollback version input: no version-history endpoint (BR-008 pending). Dialog shows
 * a number input for the user to manually supply the target version (min=1, max=current-1).
 *
 * CAS conflicts: update/rollback carry expectedVersion; 409 ERR_VERSION_CONFLICT is
 * re-thrown by the store and shown inline in the drawer/dialog.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { Can } from '@gocell/core'
import { isGoCellRequestError } from '@gocell/request'
import { useConfigStore } from '../stores/useConfigStore'
import type { ConfigEntry } from '../api/config'
import type { CreatePayload, UpdatePayload } from '../components/ConfigEditDrawer.vue'
import ConfigEditDrawer from '../components/ConfigEditDrawer.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const { t } = useI18n()
const store = useConfigStore()
const { filteredEntries, loading, errorKey, hasMore, filter, mutating } = storeToRefs(store)

onMounted(() => {
  void store.fetchList()
})

/** Locale-aware timestamp. Single Intl formatter instance reused across all rows/renders. */
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return dateFormat.format(d)
}

const REDACTED = '******'

// ─── drawer (create / edit) ─────────────────────────────────────────────────
const drawerOpen = ref(false)
const drawerEntry = ref<ConfigEntry | null>(null)
const drawerBusy = ref(false)
const drawerErrorKey = ref<string | null>(null)

function openCreate(): void {
  drawerEntry.value = null
  drawerErrorKey.value = null
  drawerOpen.value = true
}

function openEdit(entry: ConfigEntry): void {
  drawerEntry.value = entry
  drawerErrorKey.value = null
  drawerOpen.value = true
}

async function onDrawerSubmit(payload: CreatePayload | UpdatePayload): Promise<void> {
  drawerBusy.value = true
  drawerErrorKey.value = null
  try {
    if ('body' in payload) {
      // UpdatePayload
      await store.update(payload.key, payload.body)
    } else {
      // CreatePayload
      await store.create(payload)
    }
    drawerOpen.value = false
  } catch (err: unknown) {
    drawerErrorKey.value = isGoCellRequestError(err)
      ? (err.i18nKey ?? 'errors.unknown')
      : 'errors.unknown'
  } finally {
    drawerBusy.value = false
  }
}

// ─── publish confirm ─────────────────────────────────────────────────────────
const publishEntry = ref<ConfigEntry | null>(null)
const publishBusy = ref(false)
const publishErrorKey = ref<string | null>(null)

function askPublish(entry: ConfigEntry): void {
  publishEntry.value = entry
  publishErrorKey.value = null
}

async function onPublishConfirm(): Promise<void> {
  if (!publishEntry.value) return
  publishBusy.value = true
  publishErrorKey.value = null
  try {
    await store.publish(publishEntry.value.key)
    publishEntry.value = null
  } catch (err: unknown) {
    publishErrorKey.value = isGoCellRequestError(err)
      ? (err.i18nKey ?? 'errors.unknown')
      : 'errors.unknown'
  } finally {
    publishBusy.value = false
  }
}

// ─── rollback confirm ────────────────────────────────────────────────────────
const rollbackEntry = ref<ConfigEntry | null>(null)
const rollbackVersion = ref(1)
const rollbackBusy = ref(false)
const rollbackErrorKey = ref<string | null>(null)

function askRollback(entry: ConfigEntry): void {
  rollbackEntry.value = entry
  // Default to version 1 (lowest rollback target)
  rollbackVersion.value = 1
  rollbackErrorKey.value = null
}

async function onRollbackConfirm(): Promise<void> {
  if (!rollbackEntry.value) return
  rollbackBusy.value = true
  rollbackErrorKey.value = null
  try {
    await store.rollback(rollbackEntry.value.key, {
      version: rollbackVersion.value,
      expectedVersion: rollbackEntry.value.version,
    })
    rollbackEntry.value = null
  } catch (err: unknown) {
    rollbackErrorKey.value = isGoCellRequestError(err)
      ? (err.i18nKey ?? 'errors.unknown')
      : 'errors.unknown'
  } finally {
    rollbackBusy.value = false
  }
}

/** Max rollback target = current version - 1 (can't roll back to current). */
const rollbackMax = computed(() =>
  rollbackEntry.value ? Math.max(1, rollbackEntry.value.version - 1) : 1,
)

// ─── delete confirm ──────────────────────────────────────────────────────────
const deleteEntry = ref<ConfigEntry | null>(null)
const deleteBusy = ref(false)
const deleteErrorKey = ref<string | null>(null)

function askDelete(entry: ConfigEntry): void {
  deleteEntry.value = entry
  deleteErrorKey.value = null
}

async function onDeleteConfirm(): Promise<void> {
  if (!deleteEntry.value) return
  deleteBusy.value = true
  deleteErrorKey.value = null
  try {
    await store.remove(deleteEntry.value.key)
    deleteEntry.value = null
  } catch (err: unknown) {
    deleteErrorKey.value = isGoCellRequestError(err)
      ? (err.i18nKey ?? 'errors.unknown')
      : 'errors.unknown'
  } finally {
    deleteBusy.value = false
  }
}
</script>

<template>
  <section class="config">
    <!-- Page head -->
    <header class="config__header">
      <div>
        <h1 class="config__title">{{ t('config.entries.title') }}</h1>
        <p class="config__subtitle">{{ t('config.entries.subtitle') }}</p>
      </div>
      <Can action="write" resource="config">
        <button type="button" class="config__create" data-action="create" @click="openCreate">
          {{ t('config.entries.actions.create') }}
        </button>
      </Can>
    </header>

    <!-- Filter -->
    <div class="config__toolbar">
      <label class="config__filter-label" for="config-filter">
        {{ t('config.entries.filter.label') }}
      </label>
      <input
        id="config-filter"
        v-model="filter"
        class="config__filter"
        type="search"
        autocomplete="off"
        :placeholder="t('config.entries.filter.placeholder')"
      />
    </div>

    <!-- Error state -->
    <p v-if="errorKey" class="config__error" role="alert">{{ t(errorKey) }}</p>

    <!-- Loading state -->
    <p v-else-if="loading && filteredEntries.length === 0" class="config__loading" role="status">
      {{ t('config.entries.loading') }}
    </p>

    <!-- Empty state -->
    <p v-else-if="filteredEntries.length === 0" class="config__empty" role="status">
      {{ t('config.entries.empty') }}
    </p>

    <!-- Table -->
    <template v-else>
      <!-- SR-only live region -->
      <p class="sr-only" role="status">
        {{ t('config.entries.resultCount', { count: filteredEntries.length }) }}
      </p>

      <table class="config__table" :aria-label="t('config.entries.table.label')">
        <thead>
          <tr>
            <th scope="col">{{ t('config.entries.table.key') }}</th>
            <th scope="col">{{ t('config.entries.table.value') }}</th>
            <th scope="col">{{ t('config.entries.table.version') }}</th>
            <th scope="col">{{ t('config.entries.table.updatedAt') }}</th>
            <th scope="col">{{ t('config.entries.table.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in filteredEntries" :key="entry.id" class="config__row">
            <td class="config__cell config__cell--key">{{ entry.key }}</td>
            <td class="config__cell config__cell--value">
              <span
                v-if="entry.sensitive"
                class="config__redacted"
                :aria-label="t('config.entries.table.sensitiveAriaLabel')"
              >
                <span aria-hidden="true">{{ REDACTED }}</span>
                <span class="config__sensitive-tag">{{
                  t('config.entries.table.sensitiveTag')
                }}</span>
              </span>
              <span v-else>{{ entry.value }}</span>
            </td>
            <td class="config__cell">
              <span class="config__version v1-mono">{{ entry.version }}</span>
            </td>
            <td class="config__cell">
              <time :datetime="entry.updatedAt">{{ formatDate(entry.updatedAt) }}</time>
            </td>
            <td class="config__cell config__cell--actions">
              <Can action="write" resource="config">
                <button
                  type="button"
                  class="config__action"
                  :aria-label="t('config.entries.actions.editAriaLabel', { key: entry.key })"
                  @click="openEdit(entry)"
                >
                  {{ t('config.entries.actions.edit') }}
                </button>
              </Can>
              <Can action="publish" resource="config">
                <button
                  type="button"
                  class="config__action"
                  :aria-label="t('config.entries.actions.publishAriaLabel', { key: entry.key })"
                  @click="askPublish(entry)"
                >
                  {{ t('config.entries.actions.publish') }}
                </button>
              </Can>
              <Can v-if="entry.version > 1" action="rollback" resource="config">
                <button
                  type="button"
                  class="config__action"
                  :aria-label="t('config.entries.actions.rollbackAriaLabel', { key: entry.key })"
                  @click="askRollback(entry)"
                >
                  {{ t('config.entries.actions.rollback') }}
                </button>
              </Can>
              <Can action="delete" resource="config">
                <button
                  type="button"
                  class="config__action config__action--danger"
                  :aria-label="t('config.entries.actions.deleteAriaLabel', { key: entry.key })"
                  @click="askDelete(entry)"
                >
                  {{ t('config.entries.actions.delete') }}
                </button>
              </Can>
            </td>
          </tr>
        </tbody>
      </table>

      <button
        v-if="hasMore"
        type="button"
        class="config__more"
        data-action="load-more"
        :disabled="loading"
        @click="store.loadMore()"
      >
        {{ t('config.entries.loadMore') }}
      </button>
    </template>

    <!-- Drawers and dialogs -->
    <ConfigEditDrawer
      :open="drawerOpen"
      :entry="drawerEntry"
      :error-key="drawerErrorKey"
      :busy="drawerBusy || mutating"
      @submit="onDrawerSubmit"
      @cancel="drawerOpen = false"
    />

    <!-- Publish confirm dialog -->
    <ConfirmDialog
      :open="publishEntry !== null"
      title-key="config.entries.confirm.publish.title"
      message-key="config.entries.confirm.publish.message"
      confirm-key="config.entries.confirm.publish.confirm"
      :busy="publishBusy"
      :error-key="publishErrorKey"
      @confirm="onPublishConfirm"
      @cancel="publishEntry = null"
    />

    <!-- Rollback confirm dialog (with version number input injected via slot) -->
    <!-- The version input is inside the ConfirmDialog slot so it lives within the
         ModalShell panel and focus trap, avoiding inert-attribute isolation. -->
    <ConfirmDialog
      :open="rollbackEntry !== null"
      title-key="config.entries.confirm.rollback.title"
      message-key="config.entries.confirm.rollback.message"
      confirm-key="config.entries.confirm.rollback.confirm"
      :busy="rollbackBusy"
      :error-key="rollbackErrorKey"
      @confirm="onRollbackConfirm"
      @cancel="rollbackEntry = null"
    >
      <!-- Version picker — no version-history endpoint (BR-008 pending):
           user manually supplies target version. min=1, max=current-1. -->
      <div class="config__rollback-version">
        <label class="config__filter-label" for="config-rollback-version">
          {{ t('config.entries.confirm.rollback.versionLabel') }}
        </label>
        <input
          id="config-rollback-version"
          v-model.number="rollbackVersion"
          type="number"
          class="config__filter config__rollback-input"
          :min="1"
          :max="rollbackMax"
          aria-describedby="config-rollback-version-hint"
        />
        <p id="config-rollback-version-hint" class="config__hint">
          {{ t('config.entries.confirm.rollback.versionHint', { max: rollbackMax }) }}
        </p>
      </div>
    </ConfirmDialog>

    <!-- Delete confirm dialog -->
    <ConfirmDialog
      :open="deleteEntry !== null"
      title-key="config.entries.confirm.delete.title"
      message-key="config.entries.confirm.delete.message"
      confirm-key="config.entries.confirm.delete.confirm"
      :danger="true"
      :busy="deleteBusy"
      :error-key="deleteErrorKey"
      @confirm="onDeleteConfirm"
      @cancel="deleteEntry = null"
    />
  </section>
</template>

<style scoped>
.config {
  max-width: 1080px;
  padding: 28px 32px;
}

.config__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.config__title {
  margin: 0 0 4px;
  font-family: var(--font-serif);
  font-size: 26px;
  font-weight: 400;
  letter-spacing: -0.01em;
  color: var(--fg);
}

.config__subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--fg-muted);
}

.config__create {
  flex-shrink: 0;
  height: 34px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--bg);
  background: var(--fg);
  border: 1px solid var(--fg);
  border-radius: var(--r);
}

.config__create:hover {
  background: var(--fg-hover);
}

.config__create:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.config__toolbar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
  max-width: 320px;
}

.config__filter-label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--fg);
}

.config__filter {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  font-size: 13px;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r);
  transition: border-color 0.15s;
}

.config__filter::placeholder {
  color: var(--fg-faint);
}

.config__filter:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-color: var(--accent);
}

.config__error {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--err);
}

.config__loading,
.config__empty {
  margin: 0;
  padding: 32px 0;
  font-size: 13px;
  color: var(--fg-muted);
}

.config__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.config__table thead th {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  color: var(--fg-muted);
  background: var(--bg-sunken);
  border-bottom: 1px solid var(--line);
}

.config__row {
  border-bottom: 1px solid var(--line-soft);
}

.config__cell {
  padding: 10px 12px;
  color: var(--fg);
  vertical-align: middle;
}

.config__cell--key {
  font-weight: 500;
  font-family: var(--font-mono);
  font-size: 12.5px;
}

.config__cell--value {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config__cell time {
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
}

.config__cell--actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.config__redacted {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--fg-muted);
  font-family: var(--font-mono);
  font-size: 12px;
}

.config__sensitive-tag {
  padding: 2px 5px;
  font-size: 11px;
  font-family: var(--font-sans);
  color: var(--fg-muted);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
}

.config__version {
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
}

.config__action {
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;
  color: var(--fg-muted);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  white-space: nowrap;
}

.config__action:hover {
  color: var(--fg);
  background: var(--bg-sunken);
}

.config__action:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.config__action--danger {
  color: var(--err-strong);
}

.config__more {
  margin-top: 16px;
  height: 32px;
  padding: 0 14px;
  font-size: 13px;
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r);
}

.config__more:hover:not(:disabled) {
  background: var(--bg-sunken);
}

.config__more:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.config__more:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

.config__rollback-version {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
  padding: 12px 16px;
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--r);
  max-width: 280px;
}

.config__rollback-input {
  max-width: 120px;
}

.config__hint {
  margin: 0;
  font-size: 12px;
  color: var(--fg-faint);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .config__filter {
    transition: none;
  }
}
</style>
