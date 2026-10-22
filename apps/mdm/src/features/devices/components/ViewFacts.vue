<script setup lang="ts">
import { UiBadge, UiDisclosure, UiButton } from '@rss/core/components'
import { computed, ref, watch } from 'vue'
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
import CollectionQuality from './CollectionQuality.vue'
import FieldLayoutEditor from './FieldLayoutEditor.vue'
import type { FieldLayout } from '../clients/assets'
const props = defineProps<{ view: DeviceView; endpoints: EndpointDetail[] }>()
const emit = defineEmits<{ invalidated: [reason: 'cursorInvalidated' | 'denied' | 'notFound'] }>()
const category = ref<string>('overview')
const layout = ref<FieldLayout>()
const layoutFailure = ref(false)
const selectedGroup = computed(() => layout.value?.groups.find((g) => g.id === category.value))
const title = computed(
  () => selectedGroup.value?.name ?? t('devices.assetCategories.' + category.value),
)
const visibleFields = computed(() => {
  if (selectedGroup.value)
    return selectedGroup.value.fields.flatMap((key) =>
      props.view.fields[key] ? [props.view.fields[key]!] : [],
    )
  return Object.values(props.view.fields).filter(
    (f) =>
      assetCategory(f.field) === category.value &&
      (category.value !== 'extensions' ||
        !layout.value?.groups.some((g) => g.fields.includes(f.field))),
  )
})
const { t, locale } = useI18n(),
  runtime = useMdm()
const { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const collection = ref<{ device: string; id: string }>()
const catalog = ref<Awaited<ReturnType<typeof runtime.devices.assets.catalog>>>()
watch(
  () => JSON.stringify(deviceBinding(runtime)),
  () => {
    layout.value = undefined
    catalog.value = undefined
    layoutFailure.value = false
    void run(
      async () => {
        const fields = await runtime.devices.assets.catalog()
        let groups: FieldLayout | undefined
        try {
          groups = await runtime.devices.assets.fieldLayout()
        } catch {
          /* Field values remain independently readable. */
        }
        return { fields, groups }
      },
      (value) => {
        catalog.value = value.fields
        layout.value = value.groups
        layoutFailure.value = !value.groups
      },
    )
  },
  { immediate: true, flush: 'sync' },
)
function loadCollection(device: string, id: string) {
  collection.value = { device, id }
}
function metadata(field: string) {
  return catalog.value?.fields.find((f) => f.key === field)
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
      <button
        v-for="group in layout?.groups"
        :key="group.id"
        class="ui-button"
        type="button"
        :aria-pressed="category === group.id"
        @click="category = group.id"
      >
        {{ group.name }}
      </button>
      <FieldLayoutEditor
        v-if="layout && catalog"
        :layout="layout"
        :fields="catalog.fields"
        @saved="layout = $event"
      />
      <p v-if="layoutFailure" role="alert">{{ t('devices.fieldLayoutUnavailable') }}</p>
    </nav>
    <div>
      <section class="console-panel">
        <h2>{{ title }}</h2>
        <p>{{ t('devices.noTtl') }}</p>
        <p>{{ t('devices.trustedAssetsNote') }}</p>
        <dl>
          <template v-for="field in visibleFields" :key="field.field"
            ><dt>{{ assetLabel(field.field, locale) }}</dt>
            <dd>
              <p v-if="metadata(field.field)">
                {{ metadata(field.field)?.kind }} · {{ metadata(field.field)?.unit ?? '—' }} ·
                {{ metadata(field.field)?.sensitivity }}
              </p>
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
        <p v-if="!visibleFields.length">{{ t('devices.noInventory') }}</p>
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
      <CollectionQuality
        v-if="collection"
        :id="collection.id"
        :key="collection.device + collection.id"
        :device="collection.device"
        @invalidated="emit('invalidated', $event)"
      />
      <section v-if="view.inventorySources.length">
        <h2>{{ t('devices.collectionQuality') }}</h2>
        <details v-for="source in view.inventorySources" :key="source.endpoint">
          <summary>{{ source.endpoint }}</summary>
          <ul>
            <li v-for="quality in source.quality" :key="quality.runId">
              {{ quality.source }} / {{ quality.registration }} /
              {{ quality.registrationGeneration }} · {{ t('devices.runResult.' + quality.result)
              }}<UiButton
                :disabled="busy"
                @click="loadCollection(source.endpoint, quality.runId)"
                >{{ t('devices.evidence') }}</UiButton
              >
              <ul>
                <li v-for="field in quality.fields" :key="field.field">
                  {{ field.field }} · {{ t('devices.quality.' + field.quality) }} ·
                  {{ field.receivedAt ?? '—' }}
                </li>
              </ul>
            </li>
          </ul>
        </details>
      </section>
    </div>
  </div>
</template>
