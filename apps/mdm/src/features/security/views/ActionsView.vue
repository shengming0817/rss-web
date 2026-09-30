<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import SecurityFrame from '../components/SecurityFrame.vue'
import SecurityActionFacts from '../components/SecurityActionFacts.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.security.actions,
  { run, busy, failure } = useOperation()
const selected = ref<Awaited<ReturnType<typeof client.read>>>(),
  page = ref<Awaited<ReturnType<typeof client.list>>>(),
  device = ref(''),
  request = ref(''),
  applied = ref<{ device?: string; request?: string }>()
const at = (value: number) =>
  value <= 253402300799 ? new Date(value * 1000).toISOString() : String(value)
function load(cursor?: string) {
  const filter =
    cursor && applied.value
      ? { ...applied.value }
      : {
          ...(device.value ? { device: device.value } : {}),
          ...(request.value ? { request: request.value } : {}),
        }
  void run(
    () => client.list({ ...filter, ...(cursor ? { cursor } : {}) }),
    (v) => {
      page.value = v
      applied.value = filter
    },
  )
}
function open(id: string) {
  if (busy.value) return
  selected.value = undefined
  void run(
    () => client.read(id),
    (v) => (selected.value = v),
  )
}
function changed() {
  selected.value = undefined
  page.value = undefined
  applied.value = undefined
  device.value = typeof route.query['device'] === 'string' ? route.query['device'] : ''
  request.value = typeof route.query['request'] === 'string' ? route.query['request'] : ''
  if (typeof route.query['id'] === 'string') open(route.query['id'])
  else load()
}
watch(() => route.fullPath, changed, { flush: 'sync' })
onMounted(changed)
</script>
<template>
  <SecurityFrame :title="t('security.actions')" :busy="busy" :failure="failure">
    <form @submit.prevent="load()">
      <fieldset :disabled="busy">
        <label>{{ t('policies.device') }}<input v-model="device" /></label
        ><label>{{ t('security.requestId') }}<input v-model="request" /></label
        ><button>{{ t('devices.reload') }}</button>
      </fieldset>
    </form>
    <p v-if="page">
      {{ t('security.snapshotAt') }} {{ at(page.asOf) }} ·
      {{ applied?.device ?? t('devices.all') }} · {{ applied?.request ?? t('devices.all') }}
    </p>
    <p v-if="page && !page.items.length">{{ t('security.emptyActions') }}</p>
    <ul>
      <li v-for="item in page?.items" :key="item.id">
        <button :disabled="busy" @click="open(item.id)">
          {{ item.id }} · {{ item.target.device }}
        </button>
        · {{ t(`policies.fact.${item.summary.execution}`) }} ·
        {{ t(`policies.fact.${item.summary.effect}`) }}
      </li>
    </ul>
    <button v-if="page?.nextCursor" :disabled="busy" @click="load(page.nextCursor)">
      {{ t('devices.next') }}
    </button>
    <section v-if="selected">
      <h2>{{ selected.action.id }} · {{ selected.action.target.device }}</h2>
      <p>{{ t('security.asOf') }} {{ at(selected.asOf) }}</p>
      <button :disabled="busy" @click="open(selected.action.id)">{{ t('policies.refresh') }}</button
      ><SecurityActionFacts :action="selected.action" />
    </section>
  </SecurityFrame>
</template>
