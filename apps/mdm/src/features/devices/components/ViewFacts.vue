<script setup lang="ts">
import { UiBadge, UiDisclosure } from '@rss/core/components'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { DeviceView } from '../clients/device-views'
import type { EndpointDetail } from '../clients/endpoint-model'
import ChannelCard from './ChannelCard.vue'
import AssetValue from './AssetValue.vue'
import SourceList from './SourceList.vue'
defineProps<{ view: DeviceView; endpoints: EndpointDetail[] }>()
const emit = defineEmits<{ invalidated: [reason: 'cursorInvalidated' | 'denied' | 'notFound'] }>()
const { t } = useI18n(),
  runtime = useMdm()
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
  <section class="console-panel">
    <h2>{{ t('devices.inventory') }}</h2>
    <p>{{ t('devices.noTtl') }}</p>
    <dl>
      <template v-for="field in view.fields" :key="field.field"
        ><dt>{{ field.field }}</dt>
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
                :field="{ field: field.field, state: source.fact.state, sources: [source.fact] }"
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
  <section>
    <h2>{{ t('devices.manualOwner') }}</h2>
    <ul>
      <li v-for="endpoint in view.endpoints" :key="endpoint.id">
        <RouterLink
          :to="{
            name: 'device-detail',
            params: { tenant: runtime.tenant, device: endpoint.id },
            query: { tab: 'manual' },
          }"
          >{{ endpoint.id }} · {{ t('devices.manual') }}</RouterLink
        >
      </li>
    </ul>
  </section>
  <section v-if="view.inventorySources.length">
    <h2>{{ t('devices.collectionQuality') }}</h2>
    <details v-for="source in view.inventorySources" :key="source.endpoint">
      <summary>{{ source.endpoint }}</summary>
      <ul>
        <li v-for="run in source.quality" :key="run.runId">
          {{ run.source }} / {{ run.registration }} / {{ run.registrationGeneration }} ·
          {{ run.result }}
          <ul>
            <li v-for="field in run.fields" :key="field.field">
              {{ field.field }} · {{ field.quality }} · {{ field.receivedAt ?? '—' }}
            </li>
          </ul>
        </li>
      </ul>
    </details>
  </section>
</template>
