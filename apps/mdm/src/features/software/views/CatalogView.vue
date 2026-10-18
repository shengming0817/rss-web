<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import PageFrame from '../../../components/PageFrame.vue'
import VersionLifecycle from '../components/VersionLifecycle.vue'
const runtime = useMdm(),
  route = useRoute(),
  { t } = useI18n(),
  client = runtime.policies.resources,
  { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const page = ref<Awaited<ReturnType<typeof client.list>>>(),
  current = ref<Awaited<ReturnType<typeof client.read>>>(),
  id = ref(''),
  version = ref('')
function list(after?: string) {
  void run(
    () => client.list('software', after),
    (v) => {
      page.value = v
    },
  )
}
function open(value = id.value) {
  void run(
    () => client.read(value),
    (v) => {
      if (v.kind !== 'software') throw new Error('Wrong resource')
      current.value = v
      id.value = v.id
      version.value = v.versions[0]?.id ?? ''
    },
  )
}
watch(
  () => route.fullPath,
  () => {
    current.value = undefined
    id.value = ''
    version.value = ''
    if (typeof route.query['resource'] === 'string') open(route.query['resource'])
    else list()
  },
  { immediate: true },
)
watch(
  () => deviceBinding(runtime),
  () => {
    current.value = undefined
    page.value = undefined
    id.value = ''
    version.value = ''
  },
  { flush: 'sync' },
)
</script>
<template>
  <PageFrame :title="t('software.catalog')" :busy="busy" :failure="failure"
    ><RouterLink
      :to="{
        name: 'policy-resources',
        params: { tenant: runtime.tenant },
        query: { kind: 'software' },
      }"
      >{{ t('software.authorPackage') }}</RouterLink
    ><UiButton :disabled="busy" @click="list()">{{ t('policies.reload') }}</UiButton>
    <p v-if="page">{{ t('console.pageNotTotal') }}</p>
    <ul class="console-object-list">
      <li v-for="item in page?.items" :key="item.id">
        <UiButton :disabled="busy" @click="open(item.id)"
          >{{ item.id }} · {{ item.activeVersion ?? '—' }}</UiButton
        >
      </li>
    </ul>
    <UiButton v-if="page?.nextCursor" :disabled="busy" @click="list(page.nextCursor)">{{
      t('devices.next')
    }}</UiButton>
    <form @submit.prevent="open()">
      <label>{{ t('software.resource') }}<input v-model="id" class="ui-input" required /></label
      ><UiButton type="submit" :disabled="busy">{{ t('policies.open') }}</UiButton>
    </form>
    <section v-if="current" class="console-panel">
      <h2 data-testid="resource-locator">{{ current.id }} · {{ current.revision }}</h2>
      <label
        >{{ t('software.version')
        }}<select v-model="version" class="ui-input">
          <option v-for="v in current.versions" :key="v.id" :value="v.id">
            {{ v.id }} · {{ t(`policies.state.${v.state}`) }}
          </option>
        </select></label
      ><VersionLifecycle
        v-if="version"
        :key="`${current.id}/${version}`"
        :resource="current.id"
        :version="version"
      /><RouterLink
        :to="{
          name: 'policy-resources',
          params: { tenant: runtime.tenant },
          query: { resource: current.id },
        }"
        >{{ t('software.authorPackage') }}</RouterLink
      >
    </section></PageFrame
  >
</template>
