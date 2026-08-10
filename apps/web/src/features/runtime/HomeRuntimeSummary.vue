<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RuntimeInventoryFacts } from '@rss/runtime'
import { ErrorPage, SourceBadge } from '@rss/core'
import { RSS_SOURCE, UNAVAILABLE_SOURCE } from '@rss/shared'
import { toSafeReadErrorPresentation } from '../../errors/rss-error'
import { useRuntimeApi } from './runtime-context'

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: RuntimeInventoryFacts }
  | { readonly status: 'error'; readonly error: ReturnType<typeof toSafeReadErrorPresentation> }

const { t } = useI18n()
const runtime = useRuntimeApi()
const state = ref<State>({ status: 'loading' })
let generation = 0
let controller: AbortController | undefined

async function load(): Promise<void> {
  const current = ++generation
  controller?.abort()
  controller = new AbortController()
  state.value = { status: 'loading' }
  try {
    const response = await runtime.inventory({ signal: controller.signal })
    if (current === generation) state.value = { status: 'ready', data: response.data }
  } catch (error) {
    if (current === generation && !controller.signal.aborted)
      state.value = { status: 'error', error: toSafeReadErrorPresentation(error) }
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
      <h2 id="runtime-summary-title">{{ t('runtimeSummary.title') }}</h2>
      <SourceBadge v-if="state.status === 'ready'" :source="RSS_SOURCE" />
      <SourceBadge v-else-if="state.status === 'error'" :source="UNAVAILABLE_SOURCE" />
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
    <ErrorPage
      v-else
      :error="state.error"
      :heading-level="3"
      :show-recovery="state.error.recovery === 'retry'"
      @recover="load"
    />
  </section>
</template>
