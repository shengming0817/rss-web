<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RuntimeInventoryFacts } from '@rss/runtime'
import { DegradedState, SourceBadge } from '@rss/core'
import { RSS_SOURCE } from '@rss/shared'
import { toSafeReadErrorPresentation } from '../../errors/rss-error'
import { useRuntimeApi } from './runtime-context'

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: RuntimeInventoryFacts }
  | { readonly status: 'error'; readonly error: ReturnType<typeof toSafeReadErrorPresentation> }

const { t } = useI18n()
const runtime = useRuntimeApi()
const state = ref<State>({ status: 'loading' })
const retrying = ref(false)
const heading = ref<HTMLHeadingElement>()
let generation = 0
let controller: AbortController | undefined

async function load(): Promise<void> {
  const current = ++generation
  const isRecovery = state.value.status === 'error'
  controller?.abort()
  const requestController = new AbortController()
  controller = requestController
  if (isRecovery) retrying.value = true
  else state.value = { status: 'loading' }
  try {
    const response = await runtime.inventory({ signal: requestController.signal })
    if (current === generation) state.value = { status: 'ready', data: response.data }
  } catch (error) {
    if (current === generation && !requestController.signal.aborted)
      state.value = { status: 'error', error: toSafeReadErrorPresentation(error) }
  } finally {
    if (current === generation && isRecovery) {
      retrying.value = false
      await nextTick()
      heading.value?.focus()
    }
  }
}

onMounted(load)
onBeforeUnmount(() => {
  generation += 1
  controller?.abort()
})
</script>

<template>
  <section class="home-panel" aria-labelledby="runtime-summary-title">
    <header class="home-panel__header">
      <h2 id="runtime-summary-title" ref="heading" tabindex="-1">
        {{ t('runtimeSummary.title') }}
      </h2>
      <SourceBadge v-if="state.status === 'ready'" :source="RSS_SOURCE" />
    </header>
    <p v-if="state.status === 'loading'" role="status" aria-busy="true">
      {{ t('runtimeSummary.loading') }}
    </p>
    <template v-else-if="state.status === 'ready'">
      <dl class="facts">
        <div>
          <dt>{{ t('runtimeSummary.schemaVersion') }}</dt>
          <dd>{{ state.data.schemaVersion }}</dd>
        </div>
        <div>
          <dt>{{ t('runtimeSummary.assembly') }}</dt>
          <dd>
            <code>{{ state.data.assemblyFingerprint }}</code>
          </dd>
        </div>
        <div>
          <dt>{{ t('runtimeSummary.plan') }}</dt>
          <dd>
            <code>{{ state.data.runtimePlanFingerprint }}</code>
          </dd>
        </div>
        <div>
          <dt>{{ t('runtimeSummary.domains') }}</dt>
          <dd>{{ state.data.domains.join(', ') }}</dd>
        </div>
      </dl>
      <RouterLink :to="{ name: 'runtime' }" class="v1-btn">
        {{ t('runtimeSummary.details') }}
      </RouterLink>
    </template>
    <DegradedState
      v-else
      :error="state.error"
      :heading-level="3"
      :recovery="state.error.recovery === 'retry' ? 'retryRead' : 'none'"
      :recovery-busy="retrying"
      @retry-read="load"
    />
  </section>
</template>
