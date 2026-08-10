<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ErrorPage, ModalShell, SourceBadge } from '@rss/core'
import { isRoleId, type RoleView } from '@rss/identity'
import { RSS_SOURCE, UNAVAILABLE_SOURCE } from '@rss/shared'
import { toSafeErrorPresentation, toSafeReadErrorPresentation } from '../../errors/rss-error'
import { useAuthorizationIntent } from '../authorization/authorization-context'
import {
  createRoleBindingOperation,
  type RoleBindingAction,
  type RoleBindingOperationState,
} from './role-binding-operation'
import { ROLE_ASSIGN_INTENT, ROLE_REVOKE_INTENT, ROLES_LIST_INTENT } from './roles-intent'
import { useRolesApi } from './roles-context'
import { createRolesPagination, type RolesPaginationState } from './roles-pagination'

const { t } = useI18n()
const api = useRolesApi()
const listAuthorization = useAuthorizationIntent(ROLES_LIST_INTENT)
const assignAuthorization = useAuthorizationIntent(ROLE_ASSIGN_INTENT)
const revokeAuthorization = useAuthorizationIntent(ROLE_REVOKE_INTENT)
const roleIdInput = ref('')
const subjectInput = ref('')
const attempted = ref(false)
const catalogHeading = ref<HTMLElement>()
const commandHeading = ref<HTMLElement>()
const roleIdField = ref<HTMLInputElement>()
const subjectField = ref<HTMLInputElement>()
const busyStatus = ref<HTMLElement>()

const pagination = createRolesPagination((cursor, signal) =>
  listAuthorization.execute(() =>
    api.list(cursor === undefined ? { limit: 50 } : { limit: 50, cursor }, { signal }),
  ),
)
const catalog = shallowRef<RolesPaginationState>(pagination.getState())
const unsubscribeCatalog = pagination.subscribe((state) => {
  catalog.value = state
  if (state.status === 'ready' || state.status === 'error') {
    void nextTick(() => catalogHeading.value?.focus())
  }
})

const commandApi = Object.freeze({
  ...api,
  assign: (...args: Parameters<typeof api.assign>) =>
    assignAuthorization.execute(() => api.assign(...args)),
  revoke: (...args: Parameters<typeof api.revoke>) =>
    revokeAuthorization.execute(() => api.revoke(...args)),
})
const operation = createRoleBindingOperation(commandApi)
const command = shallowRef<RoleBindingOperationState>(operation.getState())
const unsubscribeCommand = operation.subscribe((state) => {
  command.value = state
  if (state.status === 'receipt' || state.status === 'error') {
    void nextTick(() => commandHeading.value?.focus())
  }
})

const catalogError = computed(() =>
  catalog.value.status === 'error' ? toSafeReadErrorPresentation(catalog.value.error) : undefined,
)
const commandError = computed(() =>
  command.value.status === 'error' ? toSafeErrorPresentation(command.value.error) : undefined,
)
const confirmation = computed(() =>
  command.value.status === 'confirming' ? command.value : undefined,
)
const commandBusy = computed(() => command.value.status === 'submitting')
const invalidRoleId = computed(() => attempted.value && !isRoleId(roleIdInput.value))
const invalidSubject = computed(() => attempted.value && subjectInput.value.length === 0)

function useRole(role: RoleView) {
  roleIdInput.value = role.roleId
  void nextTick(() => subjectField.value?.focus())
}

function prepare(action: RoleBindingAction) {
  attempted.value = true
  if (!isRoleId(roleIdInput.value)) {
    void nextTick(() => roleIdField.value?.focus())
    return
  }
  if (subjectInput.value.length === 0) {
    void nextTick(() => subjectField.value?.focus())
    return
  }
  operation.prepare(action, roleIdInput.value, subjectInput.value)
}

function confirm() {
  subjectInput.value = ''
  void operation.confirm()
  void nextTick(() => busyStatus.value?.focus())
}

onMounted(() => void pagination.start())
onBeforeUnmount(() => {
  unsubscribeCatalog()
  unsubscribeCommand()
  pagination.dispose()
  operation.dispose()
  roleIdInput.value = ''
  subjectInput.value = ''
})
</script>

<template>
  <section class="roles-page" aria-labelledby="roles-title">
    <header>
      <h1 id="roles-title" class="v1-h1">{{ t('roles.title') }}</h1>
      <p class="v1-sub">{{ t('roles.subtitle') }}</p>
    </header>

    <section class="roles-panel" aria-labelledby="roles-catalog-title">
      <header class="roles-panel__header">
        <h2 id="roles-catalog-title" ref="catalogHeading" tabindex="-1">
          {{ t('roles.catalog.title') }}
        </h2>
        <SourceBadge v-if="catalog.status === 'ready'" :source="RSS_SOURCE" />
        <SourceBadge v-else-if="catalog.status === 'error'" :source="UNAVAILABLE_SOURCE" />
      </header>
      <p>{{ t('roles.catalog.warning') }}</p>
      <p v-if="catalog.status === 'loading'" role="status" aria-live="polite">
        {{ t('roles.catalog.loading') }}
      </p>
      <p v-if="catalog.status === 'ready' && catalog.rows.length === 0">
        {{ t('roles.catalog.empty') }}
      </p>
      <ul v-if="catalog.rows.length > 0" class="roles-list">
        <li v-for="role in catalog.rows" :key="role.roleId">
          <h3>{{ role.name }}</h3>
          <dl>
            <dt>{{ t('roles.catalog.roleId') }}</dt>
            <dd>{{ role.roleId }}</dd>
            <dt>{{ t('roles.catalog.permissions') }}</dt>
            <dd>
              <ul>
                <li v-for="permission in role.permissions" :key="permission">{{ permission }}</li>
              </ul>
            </dd>
          </dl>
          <button type="button" class="v1-ghost" @click="useRole(role)">
            {{ t('roles.catalog.useRoleId') }}
          </button>
        </li>
      </ul>
      <button
        v-if="catalog.status === 'ready' && catalog.hasMore"
        type="button"
        class="v1-btn"
        @click="pagination.next()"
      >
        {{ t('roles.catalog.next') }}
      </button>
      <ErrorPage
        v-if="catalogError"
        :error="catalogError"
        :heading-level="3"
        @recover="pagination.start()"
      />
    </section>

    <section class="roles-panel" aria-labelledby="roles-command-title">
      <h2 id="roles-command-title" ref="commandHeading" tabindex="-1">
        {{ t('roles.command.title') }}
      </h2>
      <p>{{ t('roles.command.warning') }}</p>
      <form novalidate @submit.prevent>
        <label for="roles-role-id">{{ t('roles.command.roleId') }}</label>
        <input
          id="roles-role-id"
          ref="roleIdField"
          v-model="roleIdInput"
          autocomplete="off"
          spellcheck="false"
          :disabled="commandBusy"
          :aria-invalid="invalidRoleId"
        />
        <p v-if="invalidRoleId" role="alert">{{ t('roles.command.invalidRoleId') }}</p>
        <label for="roles-subject">{{ t('roles.command.subject') }}</label>
        <input
          id="roles-subject"
          ref="subjectField"
          v-model="subjectInput"
          autocomplete="off"
          spellcheck="false"
          :disabled="commandBusy"
          :aria-invalid="invalidSubject"
        />
        <p id="roles-subject-hint">{{ t('roles.command.subjectHint') }}</p>
        <p v-if="invalidSubject" role="alert">{{ t('roles.command.invalidSubject') }}</p>
        <div class="roles-actions">
          <button type="button" class="v1-btn" @click="prepare('assign')">
            {{ t('roles.command.assign') }}
          </button>
          <button type="button" class="v1-ghost" @click="prepare('revoke')">
            {{ t('roles.command.revoke') }}
          </button>
        </div>
      </form>
      <p v-if="commandBusy" ref="busyStatus" role="status" tabindex="-1" aria-live="polite">
        {{ t('roles.command.submitting') }}
      </p>
      <p v-if="command.status === 'receipt'" role="status">
        {{
          t(
            command.action === 'assign'
              ? 'roles.command.assignedReceipt'
              : 'roles.command.revokedReceipt',
            { result: command.result ? t('roles.yes') : t('roles.no') },
          )
        }}
      </p>
      <ErrorPage
        v-if="commandError"
        :error="commandError"
        :heading-level="3"
        :show-recovery="false"
      />
    </section>

    <ModalShell
      :open="confirmation !== undefined"
      role="alertdialog"
      title-id="roles-confirm-title"
      description-id="roles-confirm-description"
      @close="operation.cancel()"
    >
      <h2 id="roles-confirm-title">{{ t('roles.command.confirmTitle') }}</h2>
      <p id="roles-confirm-description">
        {{
          t('roles.command.confirmDescription', {
            action: confirmation ? t(`roles.command.${confirmation.action}`) : '',
            roleId: confirmation?.roleId,
            subject: confirmation?.subject,
          })
        }}
      </p>
      <div class="roles-actions">
        <button type="button" class="v1-ghost" @click="operation.cancel()">
          {{ t('roles.command.cancel') }}
        </button>
        <button type="button" class="v1-btn" @click="confirm">
          {{ t('roles.command.confirm') }}
        </button>
      </div>
    </ModalShell>
  </section>
</template>

<style scoped>
.roles-page {
  display: grid;
  gap: 24px;
  max-width: 1000px;
  padding: 32px;
}
.roles-panel {
  display: grid;
  gap: 16px;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--bg-raised);
}
.roles-panel__header,
.roles-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.roles-list,
.roles-panel form {
  display: grid;
  gap: 12px;
}
.roles-list > li {
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
}
.roles-panel input {
  min-height: 42px;
  padding: 8px 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  color: var(--fg);
  background: var(--bg);
}
.roles-panel dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
