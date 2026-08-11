<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ErrorPage, SourceBadge } from '@rss/core'
import type { PolicyId } from '@rss/identity'
import { RSS_SOURCE, UNAVAILABLE_SOURCE } from '@rss/shared'
import { toSafeReadErrorPresentation } from '../../errors/rss-error'
import { useAuthorizationIntent } from '../authorization/authorization-context'
import PolicyRuleList from './PolicyRuleList.vue'
import { usePoliciesApi } from './policies-context'
import { POLICIES_GET_INTENT, POLICIES_LIST_INTENT } from './policies-intent'
import { createPoliciesPagination, type PoliciesPaginationState } from './policies-pagination'
import { createPolicyDetail, type PolicyDetailState } from './policy-detail'

const { t } = useI18n()
const api = usePoliciesApi()
const listAuthorization = useAuthorizationIntent(POLICIES_LIST_INTENT)
const getAuthorization = useAuthorizationIntent(POLICIES_GET_INTENT)
const catalogHeading = ref<HTMLElement>()
const detailHeading = ref<HTMLElement>()
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
const unsubscribeDetail = detail.subscribe((state) => {
  detailState.value = state
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

async function selectPolicy(policyId: PolicyId) {
  await detail.select(policyId)
  await nextTick()
  detailHeading.value?.focus()
}

function nextPage() {
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
    void selectPolicy(detailState.value.policyId)
  }
}

onMounted(() => void pagination.start())
onBeforeUnmount(() => {
  unsubscribeCatalog()
  unsubscribeDetail()
  pagination.dispose()
  detail.dispose()
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
          :disabled="catalog.status === 'loading'"
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
