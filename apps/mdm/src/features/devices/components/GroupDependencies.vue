<script setup lang="ts">
import { ref, watch } from 'vue'
import { UiButton, UiBadge } from '@rss/core/components'
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
      <select
        v-model="kind"
        :disabled="busy"
        class="ui-input"
        :aria-label="t('devices.dependencyKind')"
        @change="load()"
      >
        <option value="">{{ t('devices.all') }}</option>
        <option
          v-for="value in ['group', 'scope', 'policy', 'compliance_rule'] as const"
          :key="value"
          :value="value"
        >
          {{ t('devices.dependencyKinds.' + value) }}
        </option></select
      ><select
        v-model="relation"
        :disabled="busy"
        class="ui-input"
        :aria-label="t('devices.dependencies')"
        @change="load()"
      >
        <option value="all">{{ t('devices.all') }}</option>
        <option value="direct">{{ t('devices.directDependency') }}</option>
        <option value="indirect">{{ t('devices.indirectDependency') }}</option></select
      ><UiButton :disabled="busy" @click="load()">{{ t('devices.reload') }}</UiButton>
    </div>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <p v-if="page?.deletionBlocked" role="status">{{ t('devices.deletionBlocked') }}</p>
    <p v-else-if="page && !page.items.length">{{ t('devices.noDependencies') }}</p>
    <ul>
      <li v-for="(item, index) in page?.items" :key="index">
        <strong>{{ t('devices.dependencyKinds.' + item.source.kind) }}</strong>
        <UiBadge>{{
          t(item.relation === 'direct' ? 'devices.directDependency' : 'devices.indirectDependency')
        }}</UiBadge>
        · {{ item.roles.join(', ') }} · {{ item.lifecycleState }} · {{ item.freshness }}
        <details>
          <summary>{{ t('devices.evidence') }}</summary>
          <p>{{ item.source.id }} · {{ item.revision }} · {{ item.effective }}</p>
          <ol>
            <li v-for="(source, i) in item.via" :key="i">{{ source.kind }} · {{ source.id }}</li>
          </ol>
        </details>
      </li>
    </ul>
    <UiButton v-if="page?.nextCursor" :disabled="busy" @click="load(page.nextCursor)">{{
      t('devices.next')
    }}</UiButton>
  </section>
</template>
