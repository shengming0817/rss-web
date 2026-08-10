<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RuntimeInventoryFacts } from '@rss/runtime'
import { ErrorPage, SourceBadge } from '@rss/core'
import { RSS_SOURCE, UNAVAILABLE_SOURCE } from '@rss/shared'
import { toSafeReadErrorPresentation } from '../../errors/rss-error'
import { useAuthorizationIntent } from '../authorization/authorization-context'
import { useRuntimeApi } from './runtime-context'
import { RUNTIME_INVENTORY_INTENT } from './runtime-intent'

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly facts: RuntimeInventoryFacts }
  | { readonly status: 'error'; readonly error: ReturnType<typeof toSafeReadErrorPresentation> }

const { t } = useI18n()
const runtime = useRuntimeApi()
const authorization = useAuthorizationIntent(RUNTIME_INVENTORY_INTENT)
const state = ref<State>({ status: 'loading' })
const retrying = ref(false)
const title = ref<HTMLHeadingElement>()
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
    const response = await authorization.execute(() =>
      runtime.inventory({ signal: requestController.signal }),
    )
    if (current === generation) {
      state.value = { status: 'ready', facts: response.data }
      retrying.value = false
      if (isRecovery) {
        await nextTick()
        title.value?.focus()
      }
    }
  } catch (error) {
    if (current === generation && !requestController.signal.aborted) {
      state.value = { status: 'error', error: toSafeReadErrorPresentation(error) }
      retrying.value = false
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
  <section class="runtime-details" aria-labelledby="runtime-details-title">
    <header class="runtime-details__header">
      <div>
        <h1 id="runtime-details-title" ref="title" class="v1-h1" tabindex="-1">
          {{ t('runtimeDetails.title') }}
        </h1>
        <p class="v1-sub">{{ t('runtimeDetails.subtitle') }}</p>
      </div>
      <SourceBadge v-if="state.status === 'ready'" :source="RSS_SOURCE" />
      <SourceBadge v-else-if="state.status === 'error'" :source="UNAVAILABLE_SOURCE" />
    </header>

    <p v-if="state.status === 'loading'" role="status" aria-busy="true">
      {{ t('runtimeDetails.loading') }}
    </p>
    <template v-else-if="state.status === 'ready'">
      <section aria-labelledby="runtime-version-title">
        <h2 id="runtime-version-title">{{ t('runtimeDetails.sections.version') }}</h2>
        <dl class="runtime-facts">
          <div>
            <dt>{{ t('runtimeSummary.schemaVersion') }}</dt>
            <dd>{{ state.facts.schemaVersion }}</dd>
          </div>
          <div>
            <dt>{{ t('runtimeSummary.assembly') }}</dt>
            <dd>
              <code>{{ state.facts.assemblyFingerprint }}</code>
            </dd>
          </div>
          <div>
            <dt>{{ t('runtimeSummary.plan') }}</dt>
            <dd>
              <code>{{ state.facts.runtimePlanFingerprint }}</code>
            </dd>
          </div>
          <template v-if="state.facts.buildMetadata">
            <div>
              <dt>{{ t('runtimeDetails.sourceRevision') }}</dt>
              <dd>
                <code>{{ state.facts.buildMetadata.sourceRevision }}</code>
              </dd>
            </div>
            <div>
              <dt>{{ t('runtimeDetails.imageDigest') }}</dt>
              <dd>
                <code>{{ state.facts.buildMetadata.imageDigest }}</code>
              </dd>
            </div>
          </template>
        </dl>
        <p>
          {{
            state.facts.buildMetadata
              ? t('runtimeDetails.buildDeclaration')
              : t('runtimeDetails.buildAbsent')
          }}
        </p>
      </section>

      <section aria-labelledby="runtime-domains-title">
        <h2 id="runtime-domains-title">{{ t('runtimeDetails.sections.domains') }}</h2>
        <ul>
          <li v-for="domain in state.facts.domains" :key="domain">{{ domain }}</li>
        </ul>
      </section>

      <section aria-labelledby="runtime-listeners-title">
        <h2 id="runtime-listeners-title">{{ t('runtimeDetails.sections.listeners') }}</h2>
        <p v-if="state.facts.listeners.length === 0">{{ t('runtimeDetails.none') }}</p>
        <ul v-else>
          <li v-for="listener in state.facts.listeners" :key="listener.id">
            <code>{{ listener.id }}</code> · {{ listener.kind }} · {{ listener.authScheme }}
          </li>
        </ul>
      </section>

      <section aria-labelledby="runtime-providers-title">
        <h2 id="runtime-providers-title">{{ t('runtimeDetails.sections.providers') }}</h2>
        <p v-if="state.facts.providerPosture.length === 0">{{ t('runtimeDetails.none') }}</p>
        <ul v-else>
          <li v-for="provider in state.facts.providerPosture" :key="provider.id">
            <code>{{ provider.id }}</code> · {{ provider.state }}
            <span v-if="provider.state === 'unobserved'">
              — {{ t('runtimeDetails.unobserved') }}</span
            >
          </li>
        </ul>
      </section>

      <section aria-labelledby="runtime-workflows-title">
        <h2 id="runtime-workflows-title">{{ t('runtimeDetails.sections.workflows') }}</h2>
        <p v-if="state.facts.activatedWorkflows.length === 0">{{ t('runtimeDetails.none') }}</p>
        <ul v-else>
          <li
            v-for="workflow in state.facts.activatedWorkflows"
            :key="`${workflow.mode}:${workflow.id}`"
          >
            <code>{{ workflow.id }}</code> · {{ workflow.mode }} ·
            {{ workflow.definitionVersion }} · {{ workflow.activation }} ·
            <code>{{ workflow.definitionSchemaDigest }}</code>
          </li>
        </ul>
      </section>

      <section aria-labelledby="runtime-placements-title">
        <h2 id="runtime-placements-title">{{ t('runtimeDetails.sections.placements') }}</h2>
        <p v-if="state.facts.placements.length === 0">{{ t('runtimeDetails.none') }}</p>
        <ul v-else>
          <li
            v-for="placement in state.facts.placements"
            :key="`${placement.domain}:${placement.workload}`"
          >
            {{ placement.domain }} · <code>{{ placement.workload }}</code> · {{ placement.mode }} ·
            {{ placement.readiness }}
          </li>
        </ul>
      </section>
    </template>
    <ErrorPage
      v-else
      :error="state.error"
      :heading-level="2"
      :show-recovery="state.error.recovery === 'retry'"
      :recovery-busy="retrying"
      @recover="load"
    />
  </section>
</template>

<style scoped>
.runtime-details {
  display: grid;
  gap: 24px;
  max-width: 1100px;
  padding: 32px;
}

.runtime-details__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

section {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
}

.runtime-facts > div {
  display: grid;
  gap: 4px;
  margin: 12px 0;
}

code,
li {
  overflow-wrap: anywhere;
}
</style>
