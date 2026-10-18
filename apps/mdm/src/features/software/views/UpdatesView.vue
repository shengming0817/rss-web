<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import PageFrame from '../../../components/PageFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.policies.resources,
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const blueprints = ref<Awaited<ReturnType<typeof client.blueprints>>>(),
  selected = ref(''),
  resource = ref(''),
  created = ref<string>()
function load() {
  void run(
    () => client.blueprints(),
    (v) => {
      blueprints.value = { ...v, items: v.items.filter((b) => b.category === 'updates') }
    },
  )
}
function instantiate() {
  if (busy.value || uncertain.value) return
  const b = blueprints.value?.items.find((b) => `${b.id}/${b.version}` === selected.value)
  if (!b) return
  const target = resource.value,
    body = operation({ action: 'instantiate' as const, blueprint: b.id, version: b.version })
  void runWrite(
    () => client.change(target, body),
    () => {
      created.value = target
    },
  )
}
onMounted(load)
watch(
  () => deviceBinding(runtime),
  () => {
    blueprints.value = undefined
    selected.value = ''
    resource.value = ''
    created.value = undefined
  },
  { flush: 'sync' },
)
</script>
<template>
  <PageFrame :title="t('software.updates')" :busy="busy" :failure="failure"
    ><section class="console-panel">
      <h2>{{ t('software.thirdPartyUpdates') }}</h2>
      <p>{{ t('software.updatePolicyHint') }}</p>
      <RouterLink :to="{ name: 'software-deployments', params: { tenant: runtime.tenant } }">{{
        t('software.deployments')
      }}</RouterLink>
    </section>
    <section class="console-panel">
      <h2>{{ t('software.osUpdates') }}</h2>
      <p>{{ t('software.nativeUpdatesHint') }}</p>
      <UiButton :disabled="busy" @click="load">{{ t('policies.reload') }}</UiButton>
      <p v-if="blueprints && !blueprints.items.length">{{ t('policies.empty') }}</p>
      <form @submit.prevent="instantiate">
        <fieldset :disabled="busy || uncertain">
          <label
            >{{ t('software.updateBlueprint')
            }}<select v-model="selected" class="ui-input" required>
              <option value="">{{ t('devices.select') }}</option>
              <option
                v-for="b in blueprints?.items"
                :key="`${b.id}/${b.version}`"
                :value="`${b.id}/${b.version}`"
              >
                {{ b.id }} · {{ b.version }} · {{ b.platform }} · {{ b.definition.kind }}
              </option>
            </select></label
          ><label
            >{{ t('software.resource')
            }}<input v-model="resource" class="ui-input" required /></label
          ><UiButton type="submit">{{ t('software.instantiate') }}</UiButton>
        </fieldset>
      </form>
      <RouterLink
        v-if="created"
        :to="{
          name: 'policy-resources',
          params: { tenant: runtime.tenant },
          query: { resource: created },
        }"
        >{{ t('software.reviewResource') }} · {{ created }}</RouterLink
      ><RouterLink :to="{ name: 'policy-policies', params: { tenant: runtime.tenant } }">{{
        t('policies.policies')
      }}</RouterLink
      ><RouterLink
        :to="{
          name: 'policy-resources',
          params: { tenant: runtime.tenant },
          query: { kind: 'configuration' },
        }"
        >{{ t('policies.configurations') }}</RouterLink
      >
      <p>{{ t('software.updateOrchestrationUnavailable') }}</p>
    </section></PageFrame
  >
</template>
