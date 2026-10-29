<script setup lang="ts">
import MdmDisclosure from '../../../ui/MdmDisclosure.vue'
import { VBtn, VSelect, VAlert, VList, VListItem, VChip } from 'vuetify/components'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
const props = defineProps<{ group: string }>()
const emit = defineEmits<{ loaded: [blocked: boolean | undefined] }>()
const runtime = useMdm(),
  { t } = useI18n(),
  client = runtime.devices.groups
const { run, busy, failure } = useOperation([], () => [...deviceBinding(runtime), props.group])
const page = ref<Awaited<ReturnType<typeof client.references>>>()
const kind = ref<'' | 'group' | 'scope' | 'policy' | 'compliance_rule'>(''),
  relation = ref<'all' | 'direct' | 'indirect'>('all')
async function load(cursor?: string) {
  page.value = undefined
  emit('loaded', undefined)
  const ok = await run(
    () =>
      client.references(props.group, {
        kind: kind.value || undefined,
        relation: relation.value,
        cursor,
      }),
    (value) => {
      page.value = value
      emit('loaded', value.deletionBlocked)
    },
  )
  if (!ok) emit('loaded', undefined)
}
watch(
  () => JSON.stringify([...deviceBinding(runtime), props.group]),
  () => {
    page.value = undefined
    void load()
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <section class="group-dependencies" :aria-busy="busy">
    <div class="console-toolbar">
      <v-select
        v-model="kind"
        :disabled="busy"
        :label="t('devices.dependencyKind')"
        :items="[
          { value: '', title: t('devices.all') },
          ...['group', 'scope', 'policy', 'compliance_rule'].map((value) => ({
            value,
            title: t('devices.dependencyKinds.' + value),
          })),
        ]"
        @update:model-value="load()"
      />
      <v-select
        v-model="relation"
        :disabled="busy"
        :label="t('devices.dependencies')"
        :items="[
          { value: 'all', title: t('devices.all') },
          { value: 'direct', title: t('devices.directDependency') },
          { value: 'indirect', title: t('devices.indirectDependency') },
        ]"
        @update:model-value="load()"
      />
      <v-btn :disabled="busy" @click="load()">{{ t('devices.reload') }}</v-btn>
    </div>
    <v-alert v-if="failure" type="error" variant="tonal">{{ t('devices.' + failure) }}</v-alert>
    <v-alert v-if="page?.deletionBlocked" type="warning" variant="tonal">{{
      t('devices.deletionBlocked')
    }}</v-alert>
    <p v-else-if="page && !page.items.length">{{ t('devices.noDependencies') }}</p>
    <v-list
      ><v-list-item
        v-for="(item, index) in page?.items"
        :key="index"
        :title="t('devices.dependencyKinds.' + item.source.kind)"
        :subtitle="item.source.id"
      >
        <v-chip>{{
          t(item.relation === 'direct' ? 'devices.directDependency' : 'devices.indirectDependency')
        }}</v-chip>
        <p>{{ item.roles.join(', ') }} · {{ item.lifecycleState }} · {{ item.freshness }}</p>
        <MdmDisclosure>
          <template #title>{{ t('devices.evidence') }}</template>
          <p>{{ item.source.id }} · {{ item.revision }} · {{ item.effective }}</p>
          <ol>
            <li v-for="(source, i) in item.via" :key="i">{{ source.kind }} · {{ source.id }}</li>
          </ol>
        </MdmDisclosure>
      </v-list-item></v-list
    >
    <v-btn v-if="page?.nextCursor" :disabled="busy" @click="load(page.nextCursor)">{{
      t('devices.next')
    }}</v-btn>
  </section>
</template>
