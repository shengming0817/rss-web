<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton, UiMessage } from '@rss/core/components'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { utc } from '../format'
const props = defineProps<{ device: string }>()
const runtime = useMdm(),
  { t } = useI18n()
const { run, busy, failure } = useOperation([], () => [...deviceBinding(runtime), props.device])
type Page = Awaited<ReturnType<typeof runtime.devices.directory.history>>
const result = ref<Page>(),
  search = ref('')
const items = computed(
  () =>
    result.value?.items.filter((x) =>
      [x.action, x.actor, x.effect].join(' ').toLowerCase().includes(search.value.toLowerCase()),
    ) ?? [],
)
async function load(next?: string) {
  const previous = next ? (result.value?.items ?? []) : []
  result.value = undefined
  await run(
    () => runtime.devices.directory.history(props.device, next),
    (value) => (result.value = { ...value, items: [...previous, ...value.items] }),
  )
}
watch(
  () => JSON.stringify([props.device, ...deviceBinding(runtime)]),
  () => {
    result.value = undefined
    void load()
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <section class="telemetry-section" :aria-busy="busy">
    <header class="telemetry-heading">
      <div>
        <h2>{{ t('telemetry.activity') }}</h2>
        <p>{{ t('telemetry.activityHint') }}</p>
      </div>
      <UiButton :disabled="busy" @click="load()">{{ t('devices.reload') }}</UiButton>
    </header>
    <UiMessage v-if="failure" tone="danger" :title="t('devices.' + failure)" />
    <label class="telemetry-search"
      >{{ t('devices.search') }}<input v-model="search" class="ui-input" type="search"
    /></label>
    <p v-if="result" class="telemetry-caption">
      {{ t('devices.historyCoverage') }}:
      {{ t(result.coverage.complete ? 'devices.yes' : 'devices.no') }} ·
      {{ t('telemetry.indexedThrough') }}
      {{ result.coverage.indexedThrough === null ? '—' : utc(result.coverage.indexedThrough) }} ·
      {{ t('telemetry.sourceThrough') }}
      {{ result.coverage.sourceThrough === null ? '—' : utc(result.coverage.sourceThrough) }}
    </p>
    <ol class="telemetry-activity">
      <li v-for="event in items" :key="event.eventId">
        <time>{{ utc(event.recordedAt) }}</time>
        <div>
          <strong>{{ event.action }}</strong>
          <p>{{ event.auditOutcome }} · {{ event.effect }}</p>
          <details>
            <summary>{{ t('devices.evidence') }}</summary>
            <dl class="telemetry-facts">
              <dt>{{ t('telemetry.observedAt') }}</dt>
              <dd>{{ utc(event.observedAt) }}</dd>
              <dt>{{ t('telemetry.actor') }}</dt>
              <dd>{{ event.actorKind }} / {{ event.actor }}</dd>
              <dt>{{ t('telemetry.registration') }}</dt>
              <dd>{{ event.registrationId ?? '—' }}</dd>
              <dt>{{ t('telemetry.operation') }}</dt>
              <dd>
                {{ event.operationId ?? '—' }}
                <p v-for="id in event.relatedOperationIds" :key="id">{{ id }}</p>
              </dd>
              <dt>{{ t('telemetry.phase') }}</dt>
              <dd>{{ event.phase }} / {{ event.executionState ?? '—' }}</dd>
            </dl>
          </details>
        </div>
      </li>
    </ol>
    <p v-if="result && !items.length" class="telemetry-empty">{{ t('telemetry.empty') }}</p>
    <UiButton v-if="result?.nextCursor" :disabled="busy" @click="load(result.nextCursor)">{{
      t('devices.next')
    }}</UiButton>
  </section>
</template>
