<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ErrorPage, ModalShell, SourceBadge } from '@rss/core'
import {
  ACCOUNT_STATUSES,
  ACCOUNT_STATUS_USER_ID_PATTERN,
  isAccountStatusUserId,
  type AccountStatus,
} from '@rss/identity'
import { RSS_SOURCE, UNAVAILABLE_SOURCE } from '@rss/shared'
import { toSafeErrorPresentation } from '../../errors/rss-error'
import { useAuthorizationIntent } from '../authorization/authorization-context'
import { useAccountStatusApi } from './account-status-context'
import { ACCOUNT_STATUS_READ_INTENT, ACCOUNT_STATUS_WRITE_INTENT } from './account-status-intent'
import {
  createAccountStatusOperation,
  type AccountStatusOperationState,
} from './account-status-operation'
import { useIdentitySession } from './session-context'

const { t } = useI18n()
const api = useAccountStatusApi()
const { session } = useIdentitySession()
const readAuthorization = useAuthorizationIntent(ACCOUNT_STATUS_READ_INTENT)
const writeAuthorization = useAuthorizationIntent(ACCOUNT_STATUS_WRITE_INTENT)
const userIdInput = ref('')
const targetStatus = ref<AccountStatus>('active')
const attempted = ref(false)
const panelHeading = ref<HTMLElement>()
const userIdField = ref<HTMLInputElement>()
const busyStatus = ref<HTMLElement>()

const operation = createAccountStatusOperation({
  get: (userId, options) => readAuthorization.execute(() => api.get(userId, options)),
  set: (userId, request, options) =>
    writeAuthorization.execute(() => api.set(userId, request, options)),
  invalidate: (userId, status) => session.invalidateForAccountStatusChange(userId, status),
})
const state = shallowRef<AccountStatusOperationState>(operation.getState())
const unsubscribe = operation.subscribe((next) => {
  state.value = next
  if (next.status === 'ready' || next.status === 'unavailable') {
    void nextTick(() => panelHeading.value?.focus())
  }
})

const busy = computed(() => state.value.status === 'reading' || state.value.status === 'writing')
const invalidUserId = computed(
  () => attempted.value && !isAccountStatusUserId(userIdInput.value.trim()),
)
const error = computed(() =>
  state.value.status === 'unavailable' ? toSafeErrorPresentation(state.value.error) : undefined,
)
const confirmation = computed(() => (state.value.status === 'confirming' ? state.value : undefined))

watch(userIdInput, (value) => {
  attempted.value = false
  const current = state.value
  if ('userId' in current && value.trim() !== current.userId) operation.reset()
})

function read(): void {
  attempted.value = true
  const userId = userIdInput.value.trim()
  if (!isAccountStatusUserId(userId)) {
    void nextTick(() => userIdField.value?.focus())
    return
  }
  if (busy.value) return
  void operation.read(userId)
}

function beginSet(): void {
  operation.beginSet(targetStatus.value)
}

function confirmSet(): void {
  void operation.confirmSet()
  void nextTick(() => busyStatus.value?.focus())
}

onBeforeUnmount(() => {
  unsubscribe()
  operation.dispose()
  userIdInput.value = ''
})
</script>

<template>
  <section class="account-status" aria-labelledby="account-status-title">
    <header>
      <h1 id="account-status-title" class="v1-h1">{{ t('accountStatus.title') }}</h1>
      <p class="v1-sub">{{ t('accountStatus.subtitle') }}</p>
    </header>

    <section class="account-status__panel" aria-labelledby="account-status-operation-title">
      <header class="account-status__panel-header">
        <h2 id="account-status-operation-title" ref="panelHeading" tabindex="-1">
          {{ t('accountStatus.operationTitle') }}
        </h2>
        <SourceBadge v-if="state.status === 'ready'" :source="RSS_SOURCE" />
        <SourceBadge v-else-if="state.status === 'unavailable'" :source="UNAVAILABLE_SOURCE" />
      </header>

      <p>{{ t('accountStatus.explicitWarning') }}</p>
      <form novalidate @submit.prevent="read">
        <label for="account-status-user-id">{{ t('accountStatus.userId') }}</label>
        <input
          id="account-status-user-id"
          ref="userIdField"
          v-model="userIdInput"
          name="userId"
          :pattern="ACCOUNT_STATUS_USER_ID_PATTERN"
          autocomplete="off"
          spellcheck="false"
          required
          :disabled="busy"
          :aria-invalid="invalidUserId"
          aria-describedby="account-status-user-id-hint"
        />
        <p id="account-status-user-id-hint">{{ t('accountStatus.userIdHint') }}</p>
        <p v-if="invalidUserId" role="alert">{{ t('accountStatus.invalidUserId') }}</p>
        <button
          type="submit"
          class="v1-btn"
          :disabled="busy"
          :aria-busy="state.status === 'reading'"
        >
          {{ t('accountStatus.read') }}
        </button>
      </form>

      <p v-if="busy" ref="busyStatus" role="status" tabindex="-1" aria-live="polite">
        {{ t(state.status === 'writing' ? 'accountStatus.writing' : 'accountStatus.reading') }}
      </p>

      <div v-if="state.status === 'ready'" class="account-status__result">
        <dl>
          <dt>{{ t('accountStatus.resultUserId') }}</dt>
          <dd>{{ state.userId }}</dd>
          <dt>{{ t('accountStatus.currentStatus') }}</dt>
          <dd>{{ t(`accountStatus.status.${state.accountStatus}`) }}</dd>
          <template v-if="state.changed !== undefined">
            <dt>{{ t('accountStatus.changed') }}</dt>
            <dd>{{ t(state.changed ? 'accountStatus.yes' : 'accountStatus.no') }}</dd>
          </template>
        </dl>
        <label for="account-status-target">{{ t('accountStatus.targetStatus') }}</label>
        <select id="account-status-target" v-model="targetStatus">
          <option v-for="status in ACCOUNT_STATUSES" :key="status" :value="status">
            {{ t(`accountStatus.status.${status}`) }}
          </option>
        </select>
        <button type="button" class="v1-btn" data-action="prepare-account-status" @click="beginSet">
          {{ t('accountStatus.prepare') }}
        </button>
      </div>

      <ErrorPage v-if="error" :error="error" :heading-level="3" :show-recovery="false" />
    </section>

    <ModalShell
      :open="confirmation !== undefined"
      role="alertdialog"
      title-id="account-status-confirm-title"
      description-id="account-status-confirm-description"
      @close="operation.cancelSet()"
    >
      <h2 id="account-status-confirm-title">{{ t('accountStatus.confirmTitle') }}</h2>
      <p id="account-status-confirm-description">
        {{
          t('accountStatus.confirmDescription', {
            userId: confirmation?.userId,
            status: confirmation ? t(`accountStatus.status.${confirmation.targetStatus}`) : '',
          })
        }}
      </p>
      <div class="account-status__dialog-actions">
        <button type="button" class="v1-ghost" @click="operation.cancelSet()">
          {{ t('accountStatus.cancel') }}
        </button>
        <button
          type="button"
          class="v1-btn"
          data-action="confirm-account-status"
          @click="confirmSet"
        >
          {{ t('accountStatus.confirm') }}
        </button>
      </div>
    </ModalShell>
  </section>
</template>

<style scoped>
.account-status {
  display: grid;
  gap: 24px;
  max-width: 900px;
  padding: 32px;
}
.account-status__panel {
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--bg-raised);
}
.account-status__panel-header,
.account-status__dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.account-status form,
.account-status__result {
  display: grid;
  gap: 10px;
  margin-top: 20px;
}
.account-status input,
.account-status select {
  min-height: 42px;
  padding: 8px 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  color: var(--fg);
  background: var(--bg);
}
.account-status dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px 16px;
}
.account-status dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.account-status__dialog-actions {
  justify-content: flex-end;
  margin-top: 24px;
}
</style>
