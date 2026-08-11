<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ErrorPage, ModalShell, SourceBadge } from '@rss/core'
import type { PolicyId, PolicyView } from '@rss/identity'
import { RSS_SOURCE, UNAVAILABLE_SOURCE } from '@rss/shared'
import { toSafeErrorPresentation, toSafeReadErrorPresentation } from '../../errors/rss-error'
import { useAuthorizationIntent } from '../authorization/authorization-context'
import PolicyRuleList from './PolicyRuleList.vue'
import PolicyEditor from './PolicyEditor.vue'
import { usePoliciesApi } from './policies-context'
import {
  POLICIES_CREATE_INTENT,
  POLICIES_DEACTIVATE_INTENT,
  POLICIES_GET_INTENT,
  POLICIES_LIST_INTENT,
  POLICIES_UPDATE_INTENT,
} from './policies-intent'
import { createPoliciesPagination, type PoliciesPaginationState } from './policies-pagination'
import { createPolicyDetail, type PolicyDetailState } from './policy-detail'
import {
  createPolicyDeactivateCommand,
  createPolicyWriteOperation,
  type PolicyWriteCommand,
  type PolicyWriteState,
} from './policy-write-operation'

const { t } = useI18n()
const api = usePoliciesApi()
const listAuthorization = useAuthorizationIntent(POLICIES_LIST_INTENT)
const getAuthorization = useAuthorizationIntent(POLICIES_GET_INTENT)
const createAuthorization = useAuthorizationIntent(POLICIES_CREATE_INTENT)
const updateAuthorization = useAuthorizationIntent(POLICIES_UPDATE_INTENT)
const deactivateAuthorization = useAuthorizationIntent(POLICIES_DEACTIVATE_INTENT)
const catalogHeading = ref<HTMLElement>()
const detailHeading = ref<HTMLElement>()
const writeHeading = ref<HTMLElement>()
const writeBusy = ref<HTMLElement>()
const catalogRetrying = ref(false)
const detailRetrying = ref(false)
const catalogRecoveryError = shallowRef<ReturnType<typeof toSafeReadErrorPresentation>>()
const detailRecoveryError = shallowRef<ReturnType<typeof toSafeReadErrorPresentation>>()
let catalogFocusRequested = false

const pagination = createPoliciesPagination((cursor, signal) =>
  listAuthorization.execute(() =>
    api.list(cursor === undefined ? { limit: 50 } : { limit: 50, cursor }, { signal }),
  ),
)
const catalog = shallowRef<PoliciesPaginationState>(pagination.getState())
const unsubscribeCatalog = pagination.subscribe((state) => {
  catalog.value = state
  if (catalogFocusRequested && (state.status === 'ready' || state.status === 'error')) {
    catalogFocusRequested = false
    catalogRetrying.value = false
    catalogRecoveryError.value = undefined
    void nextTick(() => catalogHeading.value?.focus())
  }
})

const detail = createPolicyDetail((policyId, signal) =>
  getAuthorization.execute(() => api.get(policyId, { signal })),
)
const detailState = shallowRef<PolicyDetailState>(detail.getState())
const writeBasis = shallowRef<PolicyView>()
const reconciledVersion = ref<number>()
let reconciliation: PolicyWriteCommand | undefined
const unsubscribeDetail = detail.subscribe((state) => {
  detailState.value = state
  if (state.status === 'ready') {
    writeBasis.value = state.policy
    if (
      reconciliation !== undefined &&
      (reconciliation.action === 'create'
        ? reconciliation.request.policyId === state.policy.policyId
        : reconciliation.policyId === state.policy.policyId)
    ) {
      writeOperation.reconciled(reconciliation)
      reconciledVersion.value = state.policy.version
      reconciliation = undefined
      void nextTick(() => writeHeading.value?.focus())
    }
  } else if (state.status === 'error' && reconciliation !== undefined) {
    reconciliation = undefined
  }
  if (detailRetrying.value && (state.status === 'ready' || state.status === 'error')) {
    detailRetrying.value = false
    detailRecoveryError.value = undefined
  }
})

const catalogError = computed(() =>
  catalog.value.status === 'error' ? toSafeReadErrorPresentation(catalog.value.error) : undefined,
)
const detailError = computed(() =>
  detailState.value.status === 'error'
    ? toSafeReadErrorPresentation(detailState.value.error)
    : undefined,
)
const displayedCatalogError = computed(() =>
  catalogRetrying.value ? catalogRecoveryError.value : catalogError.value,
)
const displayedDetailError = computed(() =>
  detailRetrying.value ? detailRecoveryError.value : detailError.value,
)

const writeOperation = createPolicyWriteOperation(async (command, signal) => {
  switch (command.action) {
    case 'create': {
      const result = (
        await createAuthorization.execute(() => api.create(command.request, { signal }))
      ).data
      return Object.freeze({ action: 'create' as const, command, result })
    }
    case 'update': {
      const result = (
        await updateAuthorization.execute(() =>
          api.update(command.policyId, command.request, { signal }),
        )
      ).data
      return Object.freeze({ action: 'update' as const, command, result })
    }
    case 'deactivate': {
      const result = (
        await deactivateAuthorization.execute(() =>
          api.deactivate(command.policyId, command.request, { signal }),
        )
      ).data
      return Object.freeze({ action: 'deactivate' as const, command, result })
    }
  }
})
const writeState = shallowRef<PolicyWriteState>(writeOperation.getState())
const unsubscribeWrite = writeOperation.subscribe((state) => {
  writeState.value = state
  if (state.status === 'submitting') void nextTick(() => writeBusy.value?.focus())
  if (
    state.status === 'success' ||
    state.status === 'conflict' ||
    state.status === 'unknown' ||
    state.status === 'error'
  ) {
    void nextTick(() => writeHeading.value?.focus())
  }
  if (state.status === 'success') {
    reconciledVersion.value = undefined
    void pagination.start()
    const policyId = state.action === 'deactivate' ? state.command.policyId : state.result.policyId
    writeBasis.value = undefined
    void detail.select(policyId)
  }
})
const confirmation = computed(() =>
  writeState.value.status === 'confirming' ? writeState.value : undefined,
)
const writeError = computed(() =>
  writeState.value.status === 'error' ? toSafeErrorPresentation(writeState.value.error) : undefined,
)
const writeNavigationLocked = computed(
  () =>
    writeState.value.status === 'confirming' ||
    writeState.value.status === 'submitting' ||
    writeState.value.status === 'conflict' ||
    writeState.value.status === 'unknown',
)
const writeEditorLocked = computed(
  () =>
    writeState.value.status === 'submitting' ||
    writeState.value.status === 'conflict' ||
    writeState.value.status === 'unknown',
)

async function selectPolicy(policyId: PolicyId) {
  if (writeNavigationLocked.value || !writeOperation.reset()) return
  reconciledVersion.value = undefined
  writeBasis.value = undefined
  await detail.select(policyId)
  await nextTick()
  detailHeading.value?.focus()
}

function prepareWrite(command: PolicyWriteCommand) {
  reconciledVersion.value = undefined
  writeOperation.prepare(command)
}

function prepareDeactivate() {
  if (writeBasis.value !== undefined) {
    reconciledVersion.value = undefined
    writeOperation.prepare(createPolicyDeactivateCommand(writeBasis.value))
  }
}

async function reconcileWrite() {
  const state = writeState.value
  if (state.status !== 'conflict' && state.status !== 'unknown') return
  const command = state.command
  reconciliation = command
  void pagination.start()
  if (command.action === 'create') await detail.select(command.request.policyId)
  else await detail.select(command.policyId)
}

function nextPage() {
  if (writeNavigationLocked.value) return
  catalogFocusRequested = true
  void pagination.next()
}

function recoverCatalog() {
  catalogRecoveryError.value = catalogError.value
  catalogRetrying.value = true
  catalogFocusRequested = true
  void pagination.start()
}

function recoverDetail() {
  if (detailState.value.status === 'error') {
    detailRecoveryError.value = detailError.value
    detailRetrying.value = true
    if (writeState.value.status === 'conflict' || writeState.value.status === 'unknown') {
      void reconcileWrite()
    } else {
      void selectPolicy(detailState.value.policyId)
    }
  }
}

onMounted(() => void pagination.start())
onBeforeUnmount(() => {
  unsubscribeCatalog()
  unsubscribeDetail()
  unsubscribeWrite()
  pagination.dispose()
  detail.dispose()
  writeOperation.dispose()
})
</script>

<template>
  <section class="policies-page" aria-labelledby="policies-title">
    <header>
      <div class="policies-page__title">
        <div>
          <h1 id="policies-title" class="v1-h1">{{ t('policies.title') }}</h1>
          <p class="v1-sub">{{ t('policies.subtitle') }}</p>
        </div>
        <SourceBadge :source="RSS_SOURCE" />
      </div>
      <p>{{ t('policies.authority') }}</p>
      <p>{{ t('policies.noEvaluation') }}</p>
    </header>

    <section class="policies-panel" aria-labelledby="policies-catalog-title">
      <div class="policies-panel__heading">
        <h2 id="policies-catalog-title" ref="catalogHeading" tabindex="-1">
          {{ t('policies.catalog.title') }}
        </h2>
        <SourceBadge :source="catalog.status === 'error' ? UNAVAILABLE_SOURCE : RSS_SOURCE" />
      </div>
      <p
        v-if="
          catalog.status === 'idle' || (catalog.status === 'loading' && catalog.rows.length === 0)
        "
        role="status"
        aria-live="polite"
      >
        {{ t('policies.catalog.loading') }}
      </p>
      <ErrorPage
        v-else-if="displayedCatalogError && (catalog.status === 'error' || catalogRetrying)"
        role="alert"
        :error="displayedCatalogError"
        :heading-level="3"
        :show-recovery="displayedCatalogError.recovery === 'retry'"
        :recovery-busy="catalogRetrying"
        @recover="recoverCatalog"
      />
      <p v-else-if="catalog.status === 'ready' && catalog.rows.length === 0">
        {{ t('policies.catalog.empty') }}
      </p>
      <template v-else>
        <ul class="policy-catalog">
          <li v-for="policy in catalog.rows" :key="policy.policyId">
            <button
              type="button"
              class="policy-catalog__item"
              :disabled="writeNavigationLocked"
              @click="selectPolicy(policy.policyId)"
            >
              <strong>{{ policy.policyId }}</strong>
              <span>{{ policy.contractId }} · {{ policy.permission }}</span>
              <span
                >{{ t('policies.catalog.version', { version: policy.version }) }} ·
                {{ t('policies.catalog.rules', { count: policy.rules.length }) }}</span
              >
              <span
                >{{ policy.effectiveFrom }} —
                {{ policy.effectiveUntil ?? t('policies.detail.openEnded') }}</span
              >
            </button>
          </li>
        </ul>
        <button
          v-if="(catalog.status === 'ready' || catalog.status === 'loading') && catalog.hasMore"
          type="button"
          class="v1-btn"
          :disabled="catalog.status === 'loading' || writeNavigationLocked"
          :aria-busy="catalog.status === 'loading'"
          @click="nextPage"
        >
          {{ t('policies.catalog.next') }}
        </button>
        <p v-if="catalog.status === 'loading'" role="status" aria-live="polite">
          {{ t('policies.catalog.loadingMore') }}
        </p>
      </template>
    </section>

    <section class="policies-panel" aria-labelledby="policy-detail-title">
      <div class="policies-panel__heading">
        <h2 id="policy-detail-title" ref="detailHeading" tabindex="-1">
          {{ t('policies.detail.title') }}
        </h2>
        <SourceBadge
          v-if="detailState.status === 'ready' || detailState.status === 'error'"
          :source="detailState.status === 'error' ? UNAVAILABLE_SOURCE : RSS_SOURCE"
        />
      </div>
      <p v-if="detailState.status === 'idle'">{{ t('policies.detail.select') }}</p>
      <p v-else-if="detailState.status === 'loading'" role="status" aria-live="polite">
        {{ t('policies.detail.loading') }}
      </p>
      <ErrorPage
        v-else-if="displayedDetailError && (detailState.status === 'error' || detailRetrying)"
        role="alert"
        :error="displayedDetailError"
        :heading-level="3"
        :show-recovery="displayedDetailError.recovery === 'retry'"
        :recovery-busy="detailRetrying"
        @recover="recoverDetail"
      />
      <div v-else-if="detailState.status === 'ready'" class="policy-detail">
        <dl>
          <dt>{{ t('policies.detail.policyId') }}</dt>
          <dd>{{ detailState.policy.policyId }}</dd>
          <dt>{{ t('policies.detail.version') }}</dt>
          <dd>{{ detailState.policy.version }}</dd>
          <dt>{{ t('policies.detail.contractId') }}</dt>
          <dd>{{ detailState.policy.contractId }}</dd>
          <dt>{{ t('policies.detail.permission') }}</dt>
          <dd>{{ detailState.policy.permission }}</dd>
          <dt>{{ t('policies.detail.effectiveFrom') }}</dt>
          <dd>{{ detailState.policy.effectiveFrom }}</dd>
          <dt>{{ t('policies.detail.effectiveUntil') }}</dt>
          <dd>{{ detailState.policy.effectiveUntil ?? t('policies.detail.openEnded') }}</dd>
        </dl>
        <h3>{{ t('policies.detail.rules') }}</h3>
        <PolicyRuleList :policy="detailState.policy" />
      </div>
    </section>

    <section class="policies-panel" aria-labelledby="policy-write-title">
      <h2 id="policy-write-title" ref="writeHeading" tabindex="-1">
        {{ t('policies.write.title') }}
      </h2>
      <p>{{ t('policies.write.authority') }}</p>
      <p>{{ t('policies.write.structureOnly') }}</p>

      <section aria-labelledby="policy-create-title">
        <h3 id="policy-create-title">{{ t('policies.write.create') }}</h3>
        <PolicyEditor mode="create" :busy="writeEditorLocked" @prepare="prepareWrite" />
      </section>

      <section v-if="writeBasis !== undefined" aria-labelledby="policy-update-title">
        <h3 id="policy-update-title">{{ t('policies.write.update') }}</h3>
        <p>{{ t('policies.write.snapshotVersion', { version: writeBasis.version }) }}</p>
        <PolicyEditor
          :key="writeBasis.policyId"
          mode="update"
          :snapshot="writeBasis"
          :busy="writeEditorLocked"
          @prepare="prepareWrite"
        />
        <button
          type="button"
          class="v1-ghost"
          :disabled="writeEditorLocked"
          @click="prepareDeactivate"
        >
          {{ t('policies.write.deactivate') }}
        </button>
      </section>

      <p v-if="writeState.status === 'submitting'" ref="writeBusy" role="status" tabindex="-1">
        {{ t('policies.write.submitting') }}
      </p>
      <p v-else-if="writeState.status === 'success'" role="status">
        {{ t('policies.write.success', { action: t(`policies.write.${writeState.action}`) }) }}
      </p>
      <p v-if="reconciledVersion !== undefined" role="status" aria-live="polite">
        {{ t('policies.write.reconciled', { version: reconciledVersion }) }}
      </p>
      <div
        v-else-if="writeState.status === 'conflict' || writeState.status === 'unknown'"
        role="alert"
      >
        <p>{{ t(`policies.write.${writeState.status}`) }}</p>
        <button type="button" class="v1-btn" @click="reconcileWrite">
          {{ t('policies.write.reload') }}
        </button>
      </div>
      <ErrorPage
        v-else-if="writeError"
        role="alert"
        :error="writeError"
        :heading-level="3"
        :show-recovery="false"
      />
    </section>

    <ModalShell
      :open="confirmation !== undefined"
      role="alertdialog"
      title-id="policy-write-confirm-title"
      description-id="policy-write-confirm-description"
      @close="writeOperation.cancel()"
    >
      <h2 id="policy-write-confirm-title">{{ t('policies.write.confirmTitle') }}</h2>
      <p id="policy-write-confirm-description">
        {{
          t('policies.write.confirmDescription', {
            action: confirmation ? t(`policies.write.${confirmation.command.action}`) : '',
            policyId:
              confirmation?.command.action === 'create'
                ? confirmation.command.request.policyId
                : (confirmation?.command.policyId ?? ''),
            version:
              confirmation?.command.action === 'create'
                ? '—'
                : (confirmation?.command.request.expectedVersion ?? '—'),
          })
        }}
      </p>
      <div class="policy-editor__actions">
        <button type="button" class="v1-ghost" @click="writeOperation.cancel()">
          {{ t('policies.write.cancel') }}
        </button>
        <button type="button" class="v1-btn" @click="writeOperation.submit()">
          {{ t('policies.write.confirm') }}
        </button>
      </div>
    </ModalShell>
  </section>
</template>

<style scoped>
.policies-page,
.policies-panel {
  display: grid;
  gap: 16px;
}

.policies-page {
  padding: 32px;
}

.policies-page__title,
.policies-panel__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.policies-panel {
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
}

.policy-catalog {
  display: grid;
  gap: 10px;
  padding: 0;
  list-style: none;
}

.policy-catalog__item {
  display: grid;
  width: 100%;
  gap: 4px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  color: inherit;
  background: var(--bg-raised);
  text-align: start;
}

.policy-detail dl {
  display: grid;
  grid-template-columns: minmax(140px, auto) 1fr;
  gap: 6px 16px;
}

.policy-detail dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
