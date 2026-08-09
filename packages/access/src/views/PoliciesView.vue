<script setup lang="ts">
/**
 * PoliciesView — `/access/policies` RBAC assignment page (Batch 3).
 *
 * Presents a tablist with three tabs:
 *   • roles      — active; userId lookup + RolePermissionMatrix + RoleAssignmentForm
 *   • rules      — disabled placeholder (Wave 2+)
 *   • templates  — disabled placeholder (Wave 2+)
 *
 * All mutation errors are surfaced inline (role="alert") and never swallowed.
 * Fetch errors come from the store's errorKey; mutation errors are managed
 * locally in mutationErrorKey and passed down to RoleAssignmentForm.
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { isGoCellRequestError } from '@gocell/request'
import { usePoliciesStore, TenantUnavailableError } from '../stores/usePoliciesStore'
import RolePermissionMatrix from '../components/RolePermissionMatrix.vue'
import RoleAssignmentForm from '../components/RoleAssignmentForm.vue'

const { t } = useI18n()
const store = usePoliciesStore()
const { roles, loading, errorKey, userId, mutating } = storeToRefs(store)

// ─── userId lookup form ──────────────────────────────────────────────────────
const userIdInput = ref('')
const userIdRequiredVisible = ref(false)

function onLookup(): void {
  if (!userIdInput.value.trim()) {
    userIdRequiredVisible.value = true
    return
  }
  userIdRequiredVisible.value = false
  void store.fetchRoles(userIdInput.value)
}

// ─── mutation state ──────────────────────────────────────────────────────────
const assignRoleId = ref('')
const assignErrorKey = ref<string | null>(null)
const revokeErrorKey = ref<string | null>(null)

async function onAssign(roleId: string): Promise<void> {
  assignErrorKey.value = null
  try {
    await store.assign(roleId)
    assignRoleId.value = ''
  } catch (err: unknown) {
    if (err instanceof TenantUnavailableError) {
      assignErrorKey.value = 'access.policies.errors.tenantUnavailable'
      return
    }
    assignErrorKey.value = isGoCellRequestError(err)
      ? (err.i18nKey ?? 'access.policies.errors.assignFailed')
      : 'access.policies.errors.assignFailed'
  }
}

async function onRevoke(roleId: string): Promise<void> {
  revokeErrorKey.value = null
  try {
    await store.revoke(roleId)
  } catch (err: unknown) {
    if (err instanceof TenantUnavailableError) {
      revokeErrorKey.value = 'access.policies.errors.tenantUnavailable'
      return
    }
    revokeErrorKey.value = isGoCellRequestError(err)
      ? (err.i18nKey ?? 'access.policies.errors.revokeFailed')
      : 'access.policies.errors.revokeFailed'
  }
}
</script>

<template>
  <section class="policies">
    <header class="policies__header">
      <div>
        <h1 class="policies__title">{{ t('access.policies.title') }}</h1>
        <p class="policies__subtitle">{{ t('access.policies.subtitle') }}</p>
      </div>
    </header>

    <div class="policies__tabs" role="tablist" :aria-label="t('access.policies.tabs.label')">
      <button
        id="policies-tab-roles"
        type="button"
        role="tab"
        class="policies__tab policies__tab--active"
        :aria-selected="true"
        aria-controls="policies-panel-roles"
        tabindex="0"
      >
        {{ t('access.policies.tabs.roles') }}
      </button>
      <button
        id="policies-tab-rules"
        type="button"
        role="tab"
        class="policies__tab policies__tab--disabled"
        :aria-selected="false"
        aria-disabled="true"
        aria-controls="policies-panel-rules"
        tabindex="-1"
        :title="t('access.policies.tabs.rulesHint')"
      >
        {{ t('access.policies.tabs.rules') }}
      </button>
      <button
        id="policies-tab-templates"
        type="button"
        role="tab"
        class="policies__tab policies__tab--disabled"
        :aria-selected="false"
        aria-disabled="true"
        aria-controls="policies-panel-templates"
        tabindex="-1"
        :title="t('access.policies.tabs.templatesHint')"
      >
        {{ t('access.policies.tabs.templates') }}
      </button>
    </div>

    <!-- ─── Roles panel (active) ──────────────────────────────────────────── -->
    <div
      id="policies-panel-roles"
      role="tabpanel"
      aria-labelledby="policies-tab-roles"
      class="policies__panel"
    >
      <!-- userId lookup form -->
      <form class="policies__lookup" @submit.prevent="onLookup">
        <div class="policies__field">
          <label class="policies__label" for="policies-user-input">
            {{ t('access.policies.user.label') }}
          </label>
          <div class="policies__row">
            <input
              id="policies-user-input"
              v-model.trim="userIdInput"
              class="policies__input"
              type="text"
              autocomplete="off"
              :placeholder="t('access.policies.user.placeholder')"
              :aria-invalid="userIdRequiredVisible || undefined"
              :aria-describedby="userIdRequiredVisible ? 'policies-user-required' : undefined"
            />
            <button
              type="submit"
              class="policies__lookup-btn"
              data-action="lookup"
              :disabled="loading"
              :aria-busy="loading"
            >
              {{ t('access.policies.user.load') }}
            </button>
          </div>
          <p
            v-if="userIdRequiredVisible"
            id="policies-user-required"
            class="policies__error"
            role="alert"
            data-testid="user-required-alert"
          >
            {{ t('access.policies.user.required') }}
          </p>
        </div>
      </form>

      <!-- fetch error -->
      <p v-if="errorKey" class="policies__error" role="alert">{{ t(errorKey) }}</p>

      <!-- loading indicator -->
      <p v-else-if="loading" class="policies__loading" role="status">
        {{ t('access.policies.loading') }}
      </p>

      <!-- empty state: after lookup with no roles -->
      <p v-else-if="userId && roles.length === 0" class="policies__empty" role="status">
        {{ t('access.policies.empty') }}
      </p>

      <!-- pre-lookup prompt (A-F1) -->
      <p v-else-if="!userId && roles.length === 0" class="policies__prompt" role="status">
        {{ t('access.policies.prompt') }}
      </p>

      <!-- roles content -->
      <template v-else>
        <!-- SR-only role count announcement (A-F5) -->
        <p class="sr-only" role="status">
          {{ t('access.policies.roleCount', { count: roles.length }) }}
        </p>

        <RolePermissionMatrix :roles="roles" />

        <RoleAssignmentForm
          v-model:assign-role-id="assignRoleId"
          :roles="roles"
          :busy="mutating"
          :assign-error="assignErrorKey"
          :revoke-error="revokeErrorKey"
          @assign="onAssign"
          @revoke="onRevoke"
        />
      </template>
    </div>

    <!-- ─── Rules placeholder panel (Wave 2+) ────────────────────────────── -->
    <div id="policies-panel-rules" role="tabpanel" aria-labelledby="policies-tab-rules" hidden>
      {{ t('access.policies.tabs.rulesHint') }}
    </div>

    <!-- ─── Templates placeholder panel (Wave 2+) ───────────────────────── -->
    <div
      id="policies-panel-templates"
      role="tabpanel"
      aria-labelledby="policies-tab-templates"
      hidden
    >
      {{ t('access.policies.tabs.templatesHint') }}
    </div>
  </section>
</template>

<style scoped>
.policies {
  max-width: 1080px;
  padding: 28px 32px;
}

.policies__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.policies__title {
  margin: 0 0 4px;
  font-family: var(--font-serif);
  font-size: 26px;
  font-weight: 400;
  letter-spacing: -0.01em;
  color: var(--fg);
}

.policies__subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--fg-muted);
}

.policies__tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--line);
}

.policies__tab {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--fg-muted);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: transparent;
  border-top: none;
  border-left: none;
  border-right: none;
  cursor: pointer;
}

.policies__tab--active {
  color: var(--fg);
  border-bottom-color: var(--accent);
}

.policies__tab--disabled {
  color: var(--fg-faint);
  cursor: not-allowed;
  opacity: var(--opacity-disabled);
}

.policies__tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}

.policies__panel {
  padding-top: 8px;
}

.policies__lookup {
  margin-bottom: 20px;
  max-width: 480px;
}

.policies__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.policies__label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--fg);
}

.policies__row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.policies__input {
  flex: 1;
  height: 34px;
  padding: 0 10px;
  font-size: 13px;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r);
  transition: border-color 0.15s;
}

.policies__input::placeholder {
  color: var(--fg-faint);
}

.policies__input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-color: var(--accent);
}

.policies__lookup-btn {
  flex-shrink: 0;
  height: 34px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--bg);
  background: var(--fg);
  border: 1px solid var(--fg);
  border-radius: var(--r);
  cursor: pointer;
}

.policies__lookup-btn:hover {
  background: var(--fg-hover);
}

.policies__lookup-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.policies__error {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--err);
}

.policies__loading,
.policies__empty,
.policies__prompt {
  margin: 0;
  padding: 32px 0;
  font-size: 13px;
  color: var(--fg-muted);
}

@media (prefers-reduced-motion: reduce) {
  .policies__input {
    transition: none;
  }
}
</style>
