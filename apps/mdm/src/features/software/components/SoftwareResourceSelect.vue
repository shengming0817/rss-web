<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { UiButton } from '@rss/core/components'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import type { ResourceRead } from '../../policies/clients/resources'
const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ change: [] }>()
const resource = defineModel<string>('resource', { required: true }),
  version = defineModel<string>('version', { required: true }),
  { t } = useI18n(),
  runtime = useMdm(),
  { run, busy, failure } = useOperation([], () => [...deviceBinding(runtime), resource.value])
const page = ref<Awaited<ReturnType<typeof runtime.policies.resources.list>>>(),
  selected = ref<ResourceRead>()
function load(after?: string) {
  void run(
    () => runtime.policies.resources.list('software', after),
    (v) => {
      page.value = v
    },
  )
}
function open() {
  selected.value = undefined
  void run(
    () => runtime.policies.resources.read(resource.value),
    (v) => {
      if (v.kind !== 'software') throw new Error('Wrong resource')
      selected.value = v
    },
  )
}
async function choose() {
  version.value = ''
  selected.value = undefined
  emit('change')
  await nextTick()
  open()
}
watch(
  () => deviceBinding(runtime),
  () => {
    page.value = undefined
    selected.value = undefined
  },
  { flush: 'sync' },
)
watch(
  resource,
  () => {
    selected.value = undefined
  },
  { flush: 'sync' },
)
</script>
<template>
  <div class="console-panel console-software-picker">
    <label
      >{{ t('software.resource')
      }}<input
        v-model="resource"
        class="ui-input"
        :disabled="props.disabled || busy"
        @change="choose" /></label
    ><UiButton :disabled="props.disabled || busy || !resource" @click="open">{{
      t('policies.open')
    }}</UiButton
    ><UiButton :disabled="props.disabled || busy" @click="load()">{{
      t('software.catalog')
    }}</UiButton
    ><template v-if="page"
      ><p>{{ t('console.pageNotTotal') }}</p>
      <label
        >{{ t('software.catalog')
        }}<select
          v-model="resource"
          class="ui-input"
          :disabled="props.disabled || busy"
          @change="choose"
        >
          <option value="">{{ t('devices.select') }}</option>
          <option v-for="item in page.items" :key="item.id" :value="item.id">
            {{
              typeof item.presentation['name'] === 'string' ? item.presentation['name'] : item.id
            }}
            · {{ item.activeVersion ?? '—' }}
          </option>
        </select></label
      ><UiButton
        v-if="page.nextCursor"
        :disabled="props.disabled || busy"
        @click="load(page.nextCursor)"
        >{{ t('devices.next') }}</UiButton
      ></template
    ><label v-if="selected"
      >{{ t('software.version')
      }}<select
        v-model="version"
        class="ui-input"
        :disabled="props.disabled || busy"
        @change="emit('change')"
      >
        <option value="">{{ t('devices.select') }}</option>
        <option v-for="item in selected.versions" :key="item.id" :value="item.id">
          {{ item.id }} · {{ t(`policies.state.${item.state}`) }}
        </option>
      </select></label
    >
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <p>{{ t('console.selectionNotAdmission') }}</p>
  </div>
</template>
