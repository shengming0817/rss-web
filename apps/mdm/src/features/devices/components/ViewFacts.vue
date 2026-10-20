<script setup lang="ts">
import { UiBadge, UiDisclosure, UiButton } from '@rss/core/components'
import { computed, ref } from 'vue'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import { assetCategories, assetCategory, assetLabel } from '../assetPresentation'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { DeviceView } from '../clients/device-views'
import type { EndpointDetail } from '../clients/endpoint-model'
import ChannelCard from './ChannelCard.vue'
import AssetValue from './AssetValue.vue'
import SourceList from './SourceList.vue'
const props = defineProps<{ view: DeviceView; endpoints: EndpointDetail[] }>()
const emit = defineEmits<{ invalidated: [reason: 'cursorInvalidated' | 'denied' | 'notFound'] }>()
const category = ref<(typeof assetCategories)[number]>('overview')
const visibleFields = computed(() =>
  Object.values(props.view.fields).filter((f) => assetCategory(f.field) === category.value),
)
const { t, locale } = useI18n(),
  runtime = useMdm()
const { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const collection = ref<Awaited<ReturnType<typeof runtime.devices.assets.collectionRun>>>()
async function loadCollection(device: string, id: string) {
  collection.value = undefined
  await run(
    () => runtime.devices.assets.collectionRun(device, id),
    (v) => (collection.value = v),
  )
}
</script>
<template>
  <UiDisclosure :label="t('devices.channels')"
    ><div class="console-stat-grid">
      <ChannelCard
        v-for="endpoint in view.endpoints"
        :key="endpoint.id"
        :endpoint="endpoint"
        :detail="endpoints.find((e) => e.id === endpoint.id)"
        :view="view"
      /></div
  ></UiDisclosure>
  <div class="asset-detail-layout">
    <nav class="asset-categories" :aria-label="t('devices.inventory')">
      <button
        v-for="value in assetCategories"
        :key="value"
        type="button"
        class="ui-button"
        :aria-pressed="category === value"
        @click="category = value"
      >
        {{ t('devices.assetCategories.' + value) }}
      </button>
    </nav>
    <div>
      <section class="console-panel">
        <h2>{{ t('devices.assetCategories.' + category) }}</h2>
        <p>{{ t('devices.noTtl') }}</p>
        <dl>
          <template v-for="field in visibleFields" :key="field.field"
            ><dt>{{ assetLabel(field.field, locale) }}</dt>
            <dd>
              <UiBadge :tone="field.state.kind === 'conflict' ? 'warning' : 'neutral'">{{
                t(`devices.state.${field.state.kind}`)
              }}</UiBadge
              ><span v-if="field.state.kind === 'known'">
                ·
                {{
                  typeof field.state.value.value === 'string'
                    ? field.state.value.value
                    : JSON.stringify(field.state.value.value)
                }}</span
              >
              <details v-if="field.sources.length" class="console-evidence">
                <summary>{{ t('devices.evidence') }}</summary>
                <section
                  v-for="source in field.sources"
                  :key="`${source.endpoint}:${source.fact.evidence.source}:${source.fact.evidence.dataset}`"
                >
                  <h3>{{ source.endpoint }}</h3>
                  <AssetValue
                    :field="{
                      field: field.field,
                      state: source.fact.state,
                      sources: [source.fact],
                    }"
                  />
                </section>
              </details></dd
          ></template>
        </dl>
        <p v-if="!Object.keys(view.fields).length">{{ t('devices.noInventory') }}</p>
      </section>
      <section class="console-panel">
        <h2>{{ t('devices.sourceLists') }}</h2>
        <details v-for="(list, field) in view.lists" :key="field">
          <summary>{{ field }} · {{ t(`devices.state.${list.state.kind}`) }}</summary>
          <p>{{ t('devices.listSourceNote') }}</p>
          <SourceList
            v-for="source in list.sources"
            :key="source.cursor"
            :view="view"
            :field="String(field)"
            :source="source"
            @invalidated="emit('invalidated', $event)"
          />
        </details>
      </section>
      <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
      <article v-if="collection" class="console-panel">
        <h3>{{ t('devices.collectionQuality') }}</h3>
        <p>{{ collection.quality.result }} · {{ collection.reason ?? '—' }}</p>
        <p>
          {{ t('devices.observed') }}: {{ collection.startedAt }} ·
          {{ collection.finishedAt ?? '—' }}
        </p>
        <p>
          {{ t('devices.projectionPending') }}:
          {{ t(collection.quality.deliveryPending ? 'devices.yes' : 'devices.no') }}
        </p>
        <ul>
          <li v-for="field in collection.quality.fields" :key="field.field">
            {{ assetLabel(field.field, locale) }} · {{ field.quality }} ·
            {{ field.reason ?? '—' }} ·
            {{ field.receivedAt ?? '—' }}
          </li>
        </ul>
      </article>
      <section v-if="view.inventorySources.length">
        <h2>{{ t('devices.collectionQuality') }}</h2>
        <details v-for="source in view.inventorySources" :key="source.endpoint">
          <summary>{{ source.endpoint }}</summary>
          <ul>
            <li v-for="quality in source.quality" :key="quality.runId">
              {{ quality.source }} / {{ quality.registration }} /
              {{ quality.registrationGeneration }} · {{ quality.result
              }}<UiButton
                :disabled="busy"
                @click="loadCollection(source.endpoint, quality.runId)"
                >{{ t('devices.evidence') }}</UiButton
              >
              <ul>
                <li v-for="field in quality.fields" :key="field.field">
                  {{ field.field }} · {{ field.quality }} · {{ field.receivedAt ?? '—' }}
                </li>
              </ul>
            </li>
          </ul>
        </details>
      </section>
    </div>
  </div>
</template>
