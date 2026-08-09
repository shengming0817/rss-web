<script setup lang="ts">
/**
 * IdentitiesView — `/access/identities` list page (MVP: `type=user`).
 *
 * Reads the cursor-paginated user list from `useIdentitiesStore` and renders a
 * hand-rolled semantic table + client-side quick-filter (BR-005: no server
 * filter yet). Row operations (create / edit / change-password / lock / unlock /
 * delete) open modals; every action button is gated by `<Can>` (fail-closed:
 * hidden unless the PDP allows), and the route also carries `meta.requiredAction`.
 *
 * The "Service accounts" tab is a disabled placeholder (FR-030): MVP manages
 * only user identities; service-account / cell-as-principal support is Wave 2+.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { Can } from '@gocell/core'
import { isGoCellRequestError } from '@gocell/request'
import { useIdentitiesStore } from '../stores/useIdentitiesStore'
import type { Identity } from '../api/identities'
import IdentityStatusPill from '../components/IdentityStatusPill.vue'
import IdentityFormModal from '../components/IdentityFormModal.vue'
import ChangePasswordModal from '../components/ChangePasswordModal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const { t } = useI18n()
const store = useIdentitiesStore()
const { filteredUsers, loading, errorKey, hasMore, filter } = storeToRefs(store)

onMounted(() => {
  void store.fetchList()
})

/** Locale-aware timestamp (Intl, never a hand-rolled format string). One formatter
 *  instance reused across all rows/renders — constructing it per call is ~10× costlier. */
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return dateFormat.format(d)
}

/** Screen-reader name for a row action button: action verb + the row's username
 *  (so repeated buttons aren't announced as a bare "Edit, Edit, Edit…"). */
function actionLabel(verbKey: string, username: string): string {
  return t(verbKey) + t('access.identities.actions.rowSuffix', { username })
}

// ─── operation modals ───────────────────────────────────────────────────────
const formOpen = ref(false)
const formUser = ref<Identity | null>(null)
const pwOpen = ref(false)
const pwUser = ref<Identity | null>(null)

type ConfirmAction = 'lock' | 'unlock' | 'delete'
const confirmState = ref<{ action: ConfirmAction; user: Identity } | null>(null)
const confirmBusy = ref(false)
const confirmErrorKey = ref<string | null>(null)

function openCreate(): void {
  formUser.value = null
  formOpen.value = true
}
function openEdit(user: Identity): void {
  formUser.value = user
  formOpen.value = true
}
function openChangePassword(user: Identity): void {
  pwUser.value = user
  pwOpen.value = true
}
function askConfirm(action: ConfirmAction, user: Identity): void {
  confirmErrorKey.value = null
  confirmState.value = { action, user }
}

const confirmAction = computed(() => confirmState.value?.action ?? null)
const confirmTitleKey = computed(() =>
  confirmAction.value ? `access.identities.confirm.${confirmAction.value}.title` : '',
)
const confirmMessageKey = computed(() =>
  confirmAction.value ? `access.identities.confirm.${confirmAction.value}.message` : '',
)
const confirmConfirmKey = computed(() =>
  confirmAction.value ? `access.identities.confirm.${confirmAction.value}.confirm` : '',
)
const confirmDanger = computed(() => confirmAction.value === 'delete')

async function onConfirm(): Promise<void> {
  if (!confirmState.value) return
  const { action, user } = confirmState.value
  confirmBusy.value = true
  confirmErrorKey.value = null
  try {
    // Explicit per-action dispatch — no catch-all, so a future ConfirmAction
    // can never silently fall through to the destructive remove().
    if (action === 'lock') await store.lock(user.id)
    else if (action === 'unlock') await store.unlock(user.id)
    else if (action === 'delete') await store.remove(user.id)
    else {
      // Compile-time exhaustiveness: a new ConfirmAction must add a branch above.
      const _never: never = action
      void _never
    }
    confirmState.value = null
  } catch (err: unknown) {
    confirmErrorKey.value = isGoCellRequestError(err)
      ? (err.i18nKey ?? 'errors.unknown')
      : 'errors.unknown'
  } finally {
    confirmBusy.value = false
  }
}
</script>

<template>
  <section class="identities">
    <header class="identities__header">
      <div>
        <h1 class="identities__title">{{ t('access.identities.title') }}</h1>
        <p class="identities__subtitle">{{ t('access.identities.subtitle') }}</p>
      </div>
      <Can action="create" resource="identity">
        <button type="button" class="identities__create" data-action="create" @click="openCreate">
          {{ t('access.identities.actions.create') }}
        </button>
      </Can>
    </header>

    <div class="identities__tabs" role="tablist" :aria-label="t('access.identities.tabs.label')">
      <button
        id="identities-tab-users"
        type="button"
        role="tab"
        class="identities__tab identities__tab--active"
        :aria-selected="true"
        aria-controls="identities-panel-users"
        tabindex="0"
      >
        {{ t('access.identities.tabs.users') }}
      </button>
      <button
        id="identities-tab-service-accounts"
        type="button"
        role="tab"
        class="identities__tab identities__tab--disabled"
        :aria-selected="false"
        aria-disabled="true"
        aria-controls="identities-panel-service-accounts"
        tabindex="-1"
        :title="t('access.identities.tabs.serviceAccountsHint')"
      >
        {{ t('access.identities.tabs.serviceAccounts') }}
      </button>
    </div>

    <div
      id="identities-panel-users"
      role="tabpanel"
      aria-labelledby="identities-tab-users"
      class="identities__panel"
    >
      <div class="identities__toolbar">
        <label class="identities__filter-label" for="identities-filter">
          {{ t('access.identities.filter.label') }}
        </label>
        <input
          id="identities-filter"
          v-model="filter"
          class="identities__filter"
          type="search"
          autocomplete="off"
          :placeholder="t('access.identities.filter.placeholder')"
        />
      </div>

      <p v-if="errorKey" class="identities__error" role="alert">{{ t(errorKey) }}</p>

      <p
        v-else-if="loading && filteredUsers.length === 0"
        class="identities__loading"
        role="status"
      >
        {{ t('access.identities.loading') }}
      </p>

      <p v-else-if="filteredUsers.length === 0" class="identities__empty" role="status">
        {{ t('access.identities.empty') }}
      </p>

      <template v-else>
        <!-- SR-only live region: announces the (filtered) result count as the user types. -->
        <p class="sr-only" role="status">
          {{ t('access.identities.resultCount', { count: filteredUsers.length }) }}
        </p>
        <table class="identities__table" :aria-label="t('access.identities.table.label')">
          <thead>
            <tr>
              <th scope="col">{{ t('access.identities.table.username') }}</th>
              <th scope="col">{{ t('access.identities.table.email') }}</th>
              <th scope="col">{{ t('access.identities.table.status') }}</th>
              <th scope="col">{{ t('access.identities.table.createdAt') }}</th>
              <th scope="col">{{ t('access.identities.table.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in filteredUsers" :key="u.id" class="identities__row">
              <td class="identities__cell identities__cell--name">{{ u.username }}</td>
              <td class="identities__cell">{{ u.email }}</td>
              <td class="identities__cell"><IdentityStatusPill :status="u.status" /></td>
              <td class="identities__cell">
                <time :datetime="u.createdAt">{{ formatDate(u.createdAt) }}</time>
              </td>
              <td class="identities__cell identities__cell--actions">
                <Can action="update" resource="identity">
                  <button
                    type="button"
                    class="identities__action"
                    :aria-label="actionLabel('access.identities.actions.edit', u.username)"
                    @click="openEdit(u)"
                  >
                    {{ t('access.identities.actions.edit') }}
                  </button>
                </Can>
                <Can action="change-password" resource="identity">
                  <button
                    type="button"
                    class="identities__action"
                    :aria-label="
                      actionLabel('access.identities.actions.changePassword', u.username)
                    "
                    @click="openChangePassword(u)"
                  >
                    {{ t('access.identities.actions.changePassword') }}
                  </button>
                </Can>
                <Can v-if="u.status !== 'locked'" action="lock" resource="identity">
                  <button
                    type="button"
                    class="identities__action"
                    :aria-label="actionLabel('access.identities.actions.lock', u.username)"
                    @click="askConfirm('lock', u)"
                  >
                    {{ t('access.identities.actions.lock') }}
                  </button>
                </Can>
                <Can v-else action="unlock" resource="identity">
                  <button
                    type="button"
                    class="identities__action"
                    :aria-label="actionLabel('access.identities.actions.unlock', u.username)"
                    @click="askConfirm('unlock', u)"
                  >
                    {{ t('access.identities.actions.unlock') }}
                  </button>
                </Can>
                <Can action="delete" resource="identity">
                  <button
                    type="button"
                    class="identities__action identities__action--danger"
                    :aria-label="actionLabel('access.identities.actions.delete', u.username)"
                    @click="askConfirm('delete', u)"
                  >
                    {{ t('access.identities.actions.delete') }}
                  </button>
                </Can>
              </td>
            </tr>
          </tbody>
        </table>

        <button
          v-if="hasMore"
          type="button"
          class="identities__more"
          data-action="load-more"
          :disabled="loading"
          @click="store.loadMore()"
        >
          {{ t('access.identities.loadMore') }}
        </button>
      </template>
    </div>

    <!-- Disabled placeholder panel completes the tablist widget (FR-030, Wave 2+). -->
    <div
      id="identities-panel-service-accounts"
      role="tabpanel"
      aria-labelledby="identities-tab-service-accounts"
      hidden
    >
      {{ t('access.identities.tabs.serviceAccountsHint') }}
    </div>

    <IdentityFormModal
      :open="formOpen"
      :user="formUser"
      @close="formOpen = false"
      @saved="formOpen = false"
    />
    <ChangePasswordModal
      :open="pwOpen"
      :user="pwUser"
      @close="pwOpen = false"
      @saved="pwOpen = false"
    />
    <ConfirmDialog
      :open="confirmState !== null"
      :title-key="confirmTitleKey"
      :message-key="confirmMessageKey"
      :confirm-key="confirmConfirmKey"
      :danger="confirmDanger"
      :busy="confirmBusy"
      :error-key="confirmErrorKey"
      @confirm="onConfirm"
      @cancel="confirmState = null"
    />
  </section>
</template>

<style scoped>
.identities {
  max-width: 1080px;
  padding: 28px 32px;
}

.identities__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.identities__title {
  margin: 0 0 4px;
  font-family: var(--font-serif);
  font-size: 26px;
  font-weight: 400;
  letter-spacing: -0.01em;
  color: var(--fg);
}

.identities__subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--fg-muted);
}

.identities__create {
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

.identities__create:hover {
  background: var(--fg-hover);
}

.identities__create:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.identities__tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--line);
}

.identities__tab {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--fg-muted);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.identities__tab--active {
  color: var(--fg);
  border-bottom-color: var(--accent);
}

.identities__tab--disabled {
  color: var(--fg-faint);
  cursor: not-allowed;
  opacity: var(--opacity-disabled);
}

.identities__tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}

.identities__toolbar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
  max-width: 320px;
}

.identities__filter-label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--fg);
}

.identities__filter {
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

.identities__filter::placeholder {
  color: var(--fg-faint);
}

.identities__filter:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-color: var(--accent);
}

.identities__error {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--err);
}

.identities__loading,
.identities__empty {
  margin: 0;
  padding: 32px 0;
  font-size: 13px;
  color: var(--fg-muted);
}

.identities__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.identities__table thead th {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  color: var(--fg-muted);
  background: var(--bg-sunken);
  border-bottom: 1px solid var(--line);
}

.identities__row {
  border-bottom: 1px solid var(--line-soft);
}

.identities__cell {
  padding: 10px 12px;
  color: var(--fg);
  vertical-align: middle;
}

.identities__cell--name {
  font-weight: 500;
}

.identities__cell time {
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
}

.identities__cell--actions {
  display: flex;
  gap: 6px;
}

.identities__action {
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;
  color: var(--fg-muted);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
}

.identities__action:hover {
  color: var(--fg);
  background: var(--bg-sunken);
}

.identities__action:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.identities__action--danger {
  color: var(--err-strong);
}

.identities__more {
  margin-top: 16px;
  height: 32px;
  padding: 0 14px;
  font-size: 13px;
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r);
}

.identities__more:hover:not(:disabled) {
  background: var(--bg-sunken);
}

.identities__more:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.identities__more:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .identities__filter {
    transition: none;
  }
}
</style>
