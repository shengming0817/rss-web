<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ErrorPage, SourceBadge } from '@rss/core'
import { AUDIT_TARGET_TENANT_PATTERN, isAuditTargetTenantId } from '@rss/audit'
import { RSS_SOURCE, UNAVAILABLE_SOURCE } from '@rss/shared'
import { toSafeErrorPresentation, toSafeReadErrorPresentation } from '../../errors/rss-error'
import { useAuthorizationIntent } from '../authorization/authorization-context'
import AuditEntriesTable from './AuditEntriesTable.vue'
import { useAuditApi } from './audit-context'
import { AUDIT_AMBIENT_INTENT, auditTenantIntent } from './audit-intent'
import { createAuditPagination, type AuditPaginationState } from './audit-pagination'

const { t } = useI18n()
const audit = useAuditApi()
const targetInput = ref('')
const submittedTarget = ref('')
let targetForRequest = ''

const ambientAuthorization = useAuthorizationIntent(AUDIT_AMBIENT_INTENT)
const targetIntent = computed(() => auditTenantIntent(submittedTarget.value || 'unsubmitted'))
const targetAuthorization = useAuthorizationIntent(targetIntent)

const pageOptions = (cursor: string | undefined, signal: AbortSignal) => ({
  limit: 25,
  ...(cursor === undefined ? {} : { cursor }),
  signal,
})

const ambientPagination = createAuditPagination((cursor, signal) =>
  ambientAuthorization.execute(() => audit.listEntries(pageOptions(cursor, signal))),
)
const targetPagination = createAuditPagination((cursor, signal) =>
  targetAuthorization.execute(() =>
    audit.listTenantEntries(targetForRequest, pageOptions(cursor, signal)),
  ),
)
const ambientState = shallowRef<AuditPaginationState>(ambientPagination.getState())
const targetState = shallowRef<AuditPaginationState>(targetPagination.getState())
const unsubscribeAmbient = ambientPagination.subscribe((state) => (ambientState.value = state))
const unsubscribeTarget = targetPagination.subscribe((state) => (targetState.value = state))

const ambientError = computed(() =>
  ambientState.value.status === 'error'
    ? toSafeReadErrorPresentation(ambientState.value.error)
    : undefined,
)
const targetError = computed(() =>
  targetState.value.status === 'error'
    ? toSafeErrorPresentation(targetState.value.error)
    : undefined,
)

watch(targetInput, (value) => {
  if (submittedTarget.value !== '' && value.trim() !== submittedTarget.value) {
    submittedTarget.value = ''
    targetForRequest = ''
    targetPagination.reset()
  }
})

onMounted(() => void ambientPagination.start())
onBeforeUnmount(() => {
  unsubscribeAmbient()
  unsubscribeTarget()
  ambientPagination.dispose()
  targetPagination.dispose()
  targetForRequest = ''
  submittedTarget.value = ''
})

function submitTarget(): void {
  const target = targetInput.value.trim()
  if (!isAuditTargetTenantId(target)) return
  targetPagination.reset()
  targetForRequest = target
  submittedTarget.value = target
  void targetPagination.start()
}
</script>

<template>
  <section class="audit-page" aria-labelledby="audit-page-title">
    <header>
      <h1 id="audit-page-title" class="v1-h1" tabindex="-1">{{ t('auditPage.title') }}</h1>
      <p class="v1-sub">{{ t('auditPage.subtitle') }}</p>
    </header>

    <section class="audit-panel" aria-labelledby="ambient-audit-title">
      <header class="audit-panel__header">
        <div>
          <h2 id="ambient-audit-title">{{ t('auditPage.ambientTitle') }}</h2>
          <p>{{ t('auditPage.ambientDescription') }}</p>
        </div>
        <SourceBadge v-if="ambientState.status === 'ready'" :source="RSS_SOURCE" />
        <SourceBadge v-else-if="ambientState.status === 'error'" :source="UNAVAILABLE_SOURCE" />
      </header>
      <p v-if="ambientState.status === 'loading'" role="status" aria-busy="true">
        {{ t('auditPage.loading') }}
      </p>
      <AuditEntriesTable v-if="ambientState.rows.length > 0" :rows="ambientState.rows" />
      <p v-else-if="ambientState.status === 'ready'">{{ t('auditPage.empty') }}</p>
      <button
        v-if="
          (ambientState.status === 'ready' && ambientState.hasMore) ||
          (ambientState.status === 'loading' && ambientState.rows.length > 0)
        "
        type="button"
        class="v1-btn"
        data-action="next-ambient-audit"
        :disabled="ambientState.status === 'loading'"
        :aria-busy="ambientState.status === 'loading'"
        @click="ambientPagination.next"
      >
        {{ t('auditPage.next') }}
      </button>
      <ErrorPage
        v-if="ambientError"
        :error="ambientError"
        :heading-level="3"
        :show-recovery="ambientError.recovery === 'retry'"
        @recover="ambientPagination.start"
      />
    </section>

    <section data-section="target-audit" class="audit-panel" aria-labelledby="target-audit-title">
      <header class="audit-panel__header">
        <div>
          <h2 id="target-audit-title">{{ t('auditPage.crossTitle') }}</h2>
          <p>{{ t('auditPage.crossDescription') }}</p>
        </div>
        <SourceBadge v-if="targetState.status === 'ready'" :source="RSS_SOURCE" />
        <SourceBadge v-else-if="targetState.status === 'error'" :source="UNAVAILABLE_SOURCE" />
      </header>
      <p>{{ t('auditPage.auditedWarning') }}</p>
      <form @submit.prevent="submitTarget">
        <label for="target-tenant">{{ t('auditPage.targetTenant') }}</label>
        <input
          id="target-tenant"
          v-model="targetInput"
          data-field="target-tenant"
          :pattern="AUDIT_TARGET_TENANT_PATTERN"
          required
          autocomplete="off"
          spellcheck="false"
          aria-describedby="target-tenant-hint"
        />
        <p id="target-tenant-hint">{{ t('auditPage.targetHint') }}</p>
        <button
          type="submit"
          class="v1-btn"
          :disabled="targetState.status === 'loading'"
          :aria-busy="targetState.status === 'loading'"
        >
          {{ t('auditPage.query') }}
        </button>
      </form>
      <p v-if="targetState.status === 'loading'" role="status" aria-busy="true">
        {{ t('auditPage.loading') }}
      </p>
      <AuditEntriesTable v-if="targetState.rows.length > 0" :rows="targetState.rows" />
      <p v-else-if="targetState.status === 'ready'">{{ t('auditPage.empty') }}</p>
      <button
        v-if="
          (targetState.status === 'ready' && targetState.hasMore) ||
          (targetState.status === 'loading' && targetState.rows.length > 0)
        "
        type="button"
        class="v1-btn"
        data-action="next-target-audit"
        :disabled="targetState.status === 'loading'"
        :aria-busy="targetState.status === 'loading'"
        @click="targetPagination.next"
      >
        {{ t('auditPage.next') }}
      </button>
      <ErrorPage
        v-if="targetError"
        :error="targetError"
        :heading-level="3"
        :show-recovery="false"
      />
    </section>
  </section>
</template>

<style scoped>
.audit-page {
  display: grid;
  gap: 24px;
  max-width: 1100px;
  padding: 32px;
}

.audit-panel {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
}

.audit-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

form {
  display: grid;
  gap: 8px;
  max-width: 640px;
}

input {
  min-height: 42px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--bg);
  color: var(--fg);
}
</style>
