<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { UiButton } from '@rss/core/components'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ change: [] }>()
const resource = defineModel<string>('resource', { required: true })
const version = defineModel<string>('version', { required: true })
const { t } = useI18n(),
  runtime = useMdm(),
  { run, busy, failure } = useOperation([], () => runtime.session.state.value.session?.id)
const appliedQuery = ref('')
const query = ref(''),
  page = ref<Awaited<ReturnType<typeof runtime.software.catalog.list>>>()
const selected = computed(() =>
  page.value?.items.find((item) => item.resource.id === resource.value),
)
watch(
  () => runtime.session.state.value.session?.id,
  () => {
    page.value = undefined
  },
  { flush: 'sync' },
)
function load(cursor?: string) {
  const term = cursor ? appliedQuery.value : query.value
  void run(
    () => runtime.software.catalog.list(term, cursor),
    (value) => {
      page.value = value
      appliedQuery.value = term
    },
  )
}
function choose(event: Event) {
  resource.value = (event.target as HTMLSelectElement).value
  version.value = ''
  emit('change')
}
</script>
<template>
  <div class="console-panel console-software-picker">
    <label
      >{{ t('software.catalog')
      }}<input
        v-model="query"
        class="ui-input"
        :disabled="props.disabled || busy"
        @keydown.enter.prevent="load()"
    /></label>
    <UiButton type="button" :disabled="props.disabled || busy" @click="load()">{{
      t('console.search')
    }}</UiButton>
    <template v-if="page"
      ><p>{{ t('console.pageNotTotal') }}</p>
      <label
        >{{ t('software.catalog')
        }}<select
          :value="resource"
          class="ui-input"
          :disabled="props.disabled || busy"
          @change="choose"
        >
          <option value="">{{ t('devices.select') }}</option>
          <option v-if="resource && !selected" :value="resource">{{ resource }}</option>
          <option v-for="item in page.items" :key="item.resource.id" :value="item.resource.id">
            {{ item.metadata.definition.title }}
          </option>
        </select></label
      >
      <label v-if="selected"
        >{{ t('policies.version')
        }}<select
          v-model="version"
          class="ui-input"
          :disabled="props.disabled || busy"
          @change="emit('change')"
        >
          <option value="">{{ t('devices.select') }}</option>
          <option
            v-if="version && !selected.resource.versions.some((item) => item.id === version)"
            :value="version"
          >
            {{ version }}
          </option>
          <option v-for="item in selected.resource.versions" :key="item.id" :value="item.id">
            {{ item.id }} · {{ t(`policies.state.${item.state}`) }}
          </option>
        </select></label
      >
      <UiButton
        v-if="page.nextCursor"
        type="button"
        :disabled="props.disabled || busy"
        @click="load(page.nextCursor)"
        >{{ t('devices.next') }}</UiButton
      >
    </template>
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <p>{{ t('console.selectionNotAdmission') }}</p>
  </div>
</template>
