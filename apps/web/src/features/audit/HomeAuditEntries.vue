<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AuditEntriesPage } from '@rss/audit'
import { ContentState, DegradedState, SourceBadge } from '@rss/core'
import { RSS_SOURCE } from '@rss/shared'
import { toSafeReadErrorPresentation } from '../../errors/rss-error'
import { useAuditApi } from './audit-context'

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly page: AuditEntriesPage }
  | { readonly status: 'error'; readonly error: ReturnType<typeof toSafeReadErrorPresentation> }

const { locale, t } = useI18n()
const audit = useAuditApi()
const state = ref<State>({ status: 'loading' })
const refreshing = ref(false)
let generation = 0
let controller: AbortController | undefined

async function load(): Promise<void> {
  const current = ++generation
  const preservesReadyPage = state.value.status === 'ready'
  controller?.abort()
  controller = new AbortController()
  if (preservesReadyPage) refreshing.value = true
  else state.value = { status: 'loading' }
  try {
    const page = await audit.listEntries({ limit: 10, signal: controller.signal })
    if (current === generation) state.value = { status: 'ready', page }
  } catch (error) {
    if (current === generation && !controller.signal.aborted)
      state.value = { status: 'error', error: toSafeReadErrorPresentation(error) }
  } finally {
    if (current === generation) refreshing.value = false
  }
}

onMounted(load)
onBeforeUnmount(() => {
  generation += 1
  controller?.abort()
})

function recordedAt(seconds: number): { readonly datetime?: string; readonly text: string } {
  const date = new Date(seconds * 1_000)
  if (Number.isNaN(date.getTime())) return { text: `${seconds} UTC` }
  return {
    datetime: date.toISOString(),
    text: new Intl.DateTimeFormat(locale.value, {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: 'UTC',
    }).format(date),
  }
}
</script>

<template>
  <section class="home-panel" aria-labelledby="audit-entries-title">
    <header class="home-panel__header">
      <h2 id="audit-entries-title">{{ t('auditEntries.title') }}</h2>
      <SourceBadge v-if="state.status === 'ready'" :source="RSS_SOURCE" />
    </header>
    <p class="v1-sub">{{ t('auditEntries.firstPageNotice') }}</p>
    <button
      v-if="state.status === 'ready'"
      type="button"
      class="v1-btn"
      data-action="refresh-audit"
      :disabled="refreshing"
      :aria-busy="refreshing"
      @click="load"
    >
      {{ t('auditEntries.refresh') }}
    </button>
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
          <dl class="audit-facts">
            <div>
              <dt>{{ t('auditEntries.outcome') }}</dt>
              <dd>{{ entry.outcome }}</dd>
            </div>
            <div>
              <dt>{{ t('auditEntries.recordedAt') }}</dt>
              <dd>
                <time :datetime="recordedAt(entry.recordedAt).datetime">
                  {{ recordedAt(entry.recordedAt).text }} UTC
                </time>
              </dd>
            </div>
            <div>
              <dt>{{ t('auditEntries.fingerprint') }}</dt>
              <dd>
                <code>{{ entry.entryHash }}</code>
                <span> — {{ t('auditEntries.notVerified') }}</span>
              </dd>
            </div>
          </dl>
        </li>
      </ol>
      <p v-if="state.page.hasMore">{{ t('auditEntries.hasMore') }}</p>
    </template>
    <DegradedState
      v-else
      :error="state.error"
      :heading-level="3"
      :recovery="state.error.recovery === 'retry' ? 'retryRead' : 'none'"
      @retry-read="load"
    />
  </section>
</template>
