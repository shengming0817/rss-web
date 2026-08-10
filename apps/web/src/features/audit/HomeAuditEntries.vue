<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AuditEntriesPage } from '@rss/audit'
import { ContentState, ErrorPage, SourceBadge } from '@rss/core'
import { RSS_SOURCE, UNAVAILABLE_SOURCE } from '@rss/shared'
import { toSafeErrorPresentation } from '../../errors/rss-error'
import { useAdminClients } from '../admin/admin-context'

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly page: AuditEntriesPage }
  | { readonly status: 'error'; readonly error: ReturnType<typeof toSafeErrorPresentation> }

const { t } = useI18n()
const { audit } = useAdminClients()
const state = ref<State>({ status: 'loading' })
let generation = 0
let controller: AbortController | undefined

async function load(): Promise<void> {
  const current = ++generation
  controller?.abort()
  controller = new AbortController()
  state.value = { status: 'loading' }
  try {
    const page = await audit.listEntries({ limit: 10, signal: controller.signal })
    if (current === generation) state.value = { status: 'ready', page }
  } catch (error) {
    if (current === generation && !controller.signal.aborted)
      state.value = { status: 'error', error: toSafeErrorPresentation(error) }
  }
}

onMounted(load)
onBeforeUnmount(() => {
  generation += 1
  controller?.abort()
})
</script>

<template>
  <section class="home-panel" aria-labelledby="audit-entries-title">
    <header class="home-panel__header">
      <h2 id="audit-entries-title">{{ t('auditEntries.title') }}</h2>
      <SourceBadge v-if="state.status === 'ready'" :source="RSS_SOURCE" />
      <SourceBadge v-else-if="state.status === 'error'" :source="UNAVAILABLE_SOURCE" />
    </header>
    <p class="v1-sub">{{ t('auditEntries.firstPageNotice') }}</p>
    <p v-if="state.status === 'loading'" role="status" aria-busy="true">
      {{ t('auditEntries.loading') }}
    </p>
    <ContentState
      v-else-if="state.status === 'ready' && state.page.data.length === 0"
      state="empty"
    />
    <template v-else-if="state.status === 'ready'">
      <ol class="audit-list">
        <li v-for="entry in state.page.data" :key="entry.seq">
          <strong>#{{ entry.seq }} · {{ entry.action }}</strong>
          <span>{{ entry.outcome }} · {{ entry.recordedAt }}</span>
          <code>{{ entry.entryHash }}</code>
        </li>
      </ol>
      <p v-if="state.page.hasMore">{{ t('auditEntries.hasMore') }}</p>
    </template>
    <ErrorPage
      v-else
      :error="state.error"
      :heading-level="2"
      :show-recovery="state.error.recovery === 'retry'"
      @recover="load"
    />
  </section>
</template>
