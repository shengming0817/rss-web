<script setup lang="ts">
/**
 * FlagsView — /flags feature flags management page.
 *
 * Displays flag cards with:
 *   - flag key (mono), description, type (read-only text), rollout % progress bar
 *   - v1-switch toggle (opens kill switch confirm for enabled→false)
 *   - Edit (opens FlagFormModal), Kill (danger confirm → toggle enabled=false), Delete
 *
 * Kill switch: toggle endpoint partial flip; CAS expectedVersion required.
 * Rollout %: full update payload via PUT.
 * Variant config: type field is read-only; variant UI not available (BR-007 pending).
 *
 * Write operations wrapped in <Can action="write" resource="flag"> guards.
 * Error states: loading (role=status), empty (role=status), error (role=alert).
 */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { Can } from '@gocell/core'
import { isGoCellRequestError } from '@gocell/request'
import { useFlagsStore } from '../stores/useFlagsStore'
import type { FeatureFlag } from '../api/flags'
import type { CreateFlagPayload, UpdateFlagPayload } from '../components/FlagFormModal.vue'
import FlagFormModal from '../components/FlagFormModal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const { t } = useI18n()
const store = useFlagsStore()
const { filteredFlags, loading, errorKey, hasMore, filter, mutating } = storeToRefs(store)

onMounted(() => {
  void store.fetchList()
})

// ─── modal (create / edit) ───────────────────────────────────────────────────
const modalOpen = ref(false)
const modalFlag = ref<FeatureFlag | null>(null)
const modalBusy = ref(false)
const modalErrorKey = ref<string | null>(null)

function openCreate(): void {
  modalFlag.value = null
  modalErrorKey.value = null
  modalOpen.value = true
}

function openEdit(flag: FeatureFlag): void {
  modalFlag.value = flag
  modalErrorKey.value = null
  modalOpen.value = true
}

async function onModalSubmit(payload: CreateFlagPayload | UpdateFlagPayload): Promise<void> {
  modalBusy.value = true
  modalErrorKey.value = null
  try {
    if ('expectedVersion' in payload) {
      // UpdateFlagPayload
      await store.update(payload.key, {
        enabled: payload.enabled,
        rolloutPercentage: payload.rolloutPercentage,
        description: payload.description,
        expectedVersion: payload.expectedVersion,
      })
    } else {
      // CreateFlagPayload
      await store.create({
        key: payload.key,
        enabled: payload.enabled,
        rolloutPercentage: payload.rolloutPercentage,
        description: payload.description,
      })
    }
    modalOpen.value = false
  } catch (err: unknown) {
    modalErrorKey.value = isGoCellRequestError(err)
      ? (err.i18nKey ?? 'errors.unknown')
      : 'errors.unknown'
  } finally {
    modalBusy.value = false
  }
}

// ─── toggle handler ──────────────────────────────────────────────────────────
/** Enable-path error (surfaced inline; a failed enable must NOT open the kill dialog). */
const toggleErrorKey = ref<string | null>(null)

/**
 * Handle the v1-switch checkbox change.
 * - enabled → disabled: prevent the native checkbox flip, open kill-switch confirm.
 *   The checkbox stays visually checked until the user confirms; the store refreshes
 *   and the :checked binding reflects the real state after confirmation.
 * - disabled → enabled: immediately call store.toggle(enabled=true). On failure,
 *   revert the optimistic native flip and surface the error inline — reusing the
 *   kill-switch confirm dialog here would show a "disable this flag?" prompt after
 *   a failed *enable*, which is misleading.
 */
function onToggleChange(event: Event, flag: FeatureFlag): void {
  if (flag.enabled) {
    // Kill-switch path: revert the native checkbox flip and open confirmation.
    ;(event.target as HTMLInputElement).checked = true
    event.preventDefault()
    askKill(flag)
  } else {
    // Enable path: apply immediately (no confirmation needed).
    const input = event.target as HTMLInputElement
    toggleErrorKey.value = null
    void store
      .toggle(flag.key, { enabled: true, expectedVersion: flag.version })
      .catch((err: unknown) => {
        // Revert the optimistic native flip; the store state is still disabled.
        input.checked = false
        toggleErrorKey.value = isGoCellRequestError(err)
          ? (err.i18nKey ?? 'errors.unknown')
          : 'errors.unknown'
      })
  }
}

// ─── kill switch confirm ─────────────────────────────────────────────────────
const killFlag = ref<FeatureFlag | null>(null)
const killBusy = ref(false)
const killErrorKey = ref<string | null>(null)

function askKill(flag: FeatureFlag): void {
  killFlag.value = flag
  killErrorKey.value = null
}

async function onKillConfirm(): Promise<void> {
  if (!killFlag.value) return
  killBusy.value = true
  killErrorKey.value = null
  try {
    await store.toggle(killFlag.value.key, {
      enabled: false,
      expectedVersion: killFlag.value.version,
    })
    killFlag.value = null
  } catch (err: unknown) {
    killErrorKey.value = isGoCellRequestError(err)
      ? (err.i18nKey ?? 'errors.unknown')
      : 'errors.unknown'
  } finally {
    killBusy.value = false
  }
}

// ─── delete confirm ──────────────────────────────────────────────────────────
const deleteFlag = ref<FeatureFlag | null>(null)
const deleteBusy = ref(false)
const deleteErrorKey = ref<string | null>(null)

function askDelete(flag: FeatureFlag): void {
  deleteFlag.value = flag
  deleteErrorKey.value = null
}

async function onDeleteConfirm(): Promise<void> {
  if (!deleteFlag.value) return
  deleteBusy.value = true
  deleteErrorKey.value = null
  try {
    await store.remove(deleteFlag.value.key)
    deleteFlag.value = null
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
  <section class="flags">
    <!-- Page head -->
    <header class="v1-page-head flags__header">
      <div>
        <h1 class="v1-h1">{{ t('flags.list.title') }}</h1>
        <p class="flags__subtitle">{{ t('flags.list.subtitle') }}</p>
      </div>
      <Can action="write" resource="flag">
        <button type="button" class="flags__create" data-action="create" @click="openCreate">
          {{ t('flags.list.actions.create') }}
        </button>
      </Can>
    </header>

    <!-- Filter -->
    <div class="flags__toolbar">
      <label class="flags__filter-label" for="flags-filter">
        {{ t('flags.list.filter.label') }}
      </label>
      <input
        id="flags-filter"
        v-model="filter"
        class="flags__filter"
        type="search"
        autocomplete="off"
        :placeholder="t('flags.list.filter.placeholder')"
      />
    </div>

    <!-- Enable-toggle error — surfaced inline, never via the kill dialog -->
    <p v-if="toggleErrorKey" class="flags__error" data-testid="toggle-error" role="alert">
      {{ t(toggleErrorKey) }}
    </p>

    <!-- Error state -->
    <p v-if="errorKey" class="flags__error" role="alert">{{ t(errorKey) }}</p>

    <!-- Loading state -->
    <p v-else-if="loading && filteredFlags.length === 0" class="flags__loading" role="status">
      {{ t('flags.list.loading') }}
    </p>

    <!-- Empty state -->
    <p v-else-if="filteredFlags.length === 0" class="flags__empty" role="status">
      {{ t('flags.list.empty') }}
    </p>

    <!-- Flag cards -->
    <template v-else>
      <!-- SR-only live region -->
      <p class="sr-only" role="status">
        {{ t('flags.list.resultCount', { count: filteredFlags.length }) }}
      </p>

      <div class="v1-flags">
        <div v-for="flag in filteredFlags" :key="flag.id" class="v1-flag">
          <!-- Main info -->
          <div class="v1-flag-main">
            <div class="v1-mono v1-flag-key">{{ flag.key }}</div>
            <div class="flags__flag-meta">
              <span class="flags__flag-type">{{ flag.type }}</span>
              <span class="flags__flag-desc">{{ flag.description }}</span>
            </div>
          </div>

          <!-- Rollout progress bar — width data-driven via CSS variable (not magic number) -->
          <div
            class="v1-flag-bar"
            :aria-label="t('flags.list.card.rolloutAriaLabel', { pct: flag.rolloutPercentage })"
          >
            <div class="v1-flag-fill" :style="{ '--rollout-pct': `${flag.rolloutPercentage}%` }" />
          </div>

          <!-- Variant coming-soon placeholder (BR-007 pending: flag variant schema) -->
          <span
            data-testid="variant-placeholder"
            class="flags__variant-badge"
            :aria-label="t('flags.list.card.variantComingSoon')"
          >
            {{ t('flags.list.card.variantComingSoon') }}
          </span>

          <!-- Enabled toggle (v1-switch) — write-gated by <Can> -->
          <Can action="write" resource="flag">
            <label class="v1-switch">
              <input
                type="checkbox"
                :checked="flag.enabled"
                :aria-label="
                  t('flags.list.card.toggleAriaLabel', {
                    key: flag.key,
                    state: flag.enabled
                      ? t('flags.list.card.enabled')
                      : t('flags.list.card.disabled'),
                  })
                "
                @change="onToggleChange($event, flag)"
              />
              <span />
            </label>
          </Can>

          <!-- Row actions -->
          <div class="flags__actions">
            <Can action="write" resource="flag">
              <button
                type="button"
                class="flags__action"
                :aria-label="t('flags.list.actions.editAriaLabel', { key: flag.key })"
                @click="openEdit(flag)"
              >
                {{ t('flags.list.actions.edit') }}
              </button>
            </Can>
            <Can action="write" resource="flag">
              <button
                v-if="flag.enabled"
                type="button"
                data-action="kill"
                class="flags__action flags__action--danger"
                :aria-label="t('flags.list.actions.killAriaLabel', { key: flag.key })"
                @click="askKill(flag)"
              >
                {{ t('flags.list.actions.kill') }}
              </button>
            </Can>
            <Can action="delete" resource="flag">
              <button
                type="button"
                data-action="delete"
                class="flags__action flags__action--danger"
                :aria-label="t('flags.list.actions.deleteAriaLabel', { key: flag.key })"
                @click="askDelete(flag)"
              >
                {{ t('flags.list.actions.delete') }}
              </button>
            </Can>
          </div>
        </div>
      </div>

      <button
        v-if="hasMore"
        type="button"
        class="flags__more"
        data-action="load-more"
        :disabled="loading || undefined"
        @click="store.loadMore()"
      >
        {{ t('flags.list.loadMore') }}
      </button>
    </template>

    <!-- Create / edit modal -->
    <FlagFormModal
      :open="modalOpen"
      :flag="modalFlag"
      :error-key="modalErrorKey"
      :busy="modalBusy || mutating"
      @submit="onModalSubmit"
      @cancel="modalOpen = false"
    />

    <!-- Kill switch confirm dialog (danger) -->
    <ConfirmDialog
      :open="killFlag !== null"
      title-key="flags.list.confirm.kill.title"
      message-key="flags.list.confirm.kill.message"
      confirm-key="flags.list.confirm.kill.confirm"
      cancel-key="flags.list.confirm.cancel"
      :danger="true"
      :busy="killBusy"
      :error-key="killErrorKey"
      @confirm="onKillConfirm"
      @cancel="killFlag = null"
    />

    <!-- Delete confirm dialog (danger) -->
    <ConfirmDialog
      :open="deleteFlag !== null"
      title-key="flags.list.confirm.delete.title"
      message-key="flags.list.confirm.delete.message"
      confirm-key="flags.list.confirm.delete.confirm"
      cancel-key="flags.list.confirm.cancel"
      :danger="true"
      :busy="deleteBusy"
      :error-key="deleteErrorKey"
      @confirm="onDeleteConfirm"
      @cancel="deleteFlag = null"
    />
  </section>
</template>

<style scoped>
.flags {
  max-width: 1080px;
  padding: 28px 32px;
}

.flags__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.flags__subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--fg-muted);
}

.flags__create {
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

.flags__create:hover {
  background: var(--fg-hover);
}

.flags__create:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.flags__toolbar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
  max-width: 320px;
}

.flags__filter-label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--fg);
}

.flags__filter {
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

.flags__filter::placeholder {
  color: var(--fg-faint);
}

.flags__filter:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-color: var(--accent);
}

.flags__error {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--err);
}

.flags__loading,
.flags__empty {
  margin: 0;
  padding: 32px 0;
  font-size: 13px;
  color: var(--fg-muted);
}

/* Flag card grid — extends v1-flag design with room for actions column */
.v1-flags {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.v1-flag {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) 180px 80px 36px auto;
  gap: 16px;
  align-items: center;
  padding: 14px 18px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--bg-raised);
}

.v1-flag-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.v1-flag-key {
  font-weight: 500;
  font-size: 13px;
  color: var(--fg);
}

.flags__flag-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.flags__flag-type {
  font-size: 11px;
  color: var(--fg-muted);
  padding: 1px 5px;
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  font-family: var(--font-mono);
}

.flags__flag-desc {
  font-size: 12px;
  color: var(--fg-muted);
}

.v1-flag-bar {
  height: 4px;
  background: var(--line-soft);
  border-radius: var(--r-sm);
  overflow: hidden;
}

.v1-flag-fill {
  height: 100%;
  width: var(--rollout-pct, 0%);
  background: var(--accent);
  transition: width 0.25s;
}

.flags__variant-badge {
  font-size: 11px;
  color: var(--fg-faint);
  white-space: nowrap;
}

/* v1-switch styles (matches v1-linear.css design) */
.v1-switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  cursor: pointer;
}

.v1-switch input {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
}

.v1-switch input:focus-visible + span {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.v1-switch span {
  position: absolute;
  inset: 0;
  border-radius: var(--r-pill);
  background: var(--line);
  transition: background 0.2s;
  pointer-events: none;
}

.v1-switch span::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--bg-raised);
  transition: left 0.2s;
  box-shadow: var(--shadow-sm);
}

.v1-switch input:checked + span {
  background: var(--accent);
}

.v1-switch input:checked + span::after {
  left: 18px;
}

.flags__actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.flags__action {
  min-height: 28px;
  padding: 0 10px;
  font-size: 12px;
  color: var(--fg-muted);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  white-space: nowrap;
}

.flags__action:hover {
  color: var(--fg);
  background: var(--bg-sunken);
}

.flags__action:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.flags__action--danger {
  color: var(--err-strong);
}

.flags__more {
  margin-top: 16px;
  height: 32px;
  padding: 0 14px;
  font-size: 13px;
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r);
}

.flags__more:hover:not(:disabled) {
  background: var(--bg-sunken);
}

.flags__more:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.flags__more:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
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
  .flags__filter,
  .v1-flag-fill,
  .v1-switch span,
  .v1-switch span::after {
    transition: none;
  }
}
</style>
