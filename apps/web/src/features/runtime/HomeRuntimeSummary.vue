<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RuntimeInventoryData } from '@rss/runtime'
import { ErrorPage, SourceBadge } from '@rss/core'
import { RSS_SOURCE, UNAVAILABLE_SOURCE } from '@rss/shared'
import { toSafeErrorPresentation } from '../../errors/rss-error'
import { useAdminClients } from '../admin/admin-context'

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: RuntimeInventoryData }
  | { readonly status: 'error'; readonly error: ReturnType<typeof toSafeErrorPresentation> }

const { t } = useI18n()
const { runtime } = useAdminClients()
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
  <section class="home-panel" aria-labelledby="runtime-summary-title">
    <header class="home-panel__header">
      <h2 id="runtime-summary-title">{{ t('runtimeSummary.title') }}</h2>
      <SourceBadge v-if="state.status === 'ready'" :source="RSS_SOURCE" />
      <SourceBadge v-else-if="state.status === 'error'" :source="UNAVAILABLE_SOURCE" />
    </header>
    <p v-if="state.status === 'loading'" role="status" aria-busy="true">
      {{ t('runtimeSummary.loading') }}
    </p>
    <dl v-else-if="state.status === 'ready'" class="facts">
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
    <ErrorPage
      v-else
      :error="state.error"
      :heading-level="2"
      :show-recovery="state.error.recovery === 'retry'"
      @recover="load"
    />
  </section>
</template>
