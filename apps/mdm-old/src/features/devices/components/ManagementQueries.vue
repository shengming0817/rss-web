<script setup lang="ts">
import {
  VBtn,
  VSelect,
  VCheckbox,
  VExpansionPanels,
  VExpansionPanel,
  VExpansionPanelTitle,
  VExpansionPanelText,
} from 'vuetify/components'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { useOriginalOperation } from '../../../services/useOriginalOperation'
import { useSettingsFacts } from '../../settings/useSettingsAction'
const props = defineProps<{ device: string }>(),
  runtime = useMdm(),
  { t } = useI18n()
const { run, busy, failure } = useOperation([], () => [
  props.device,
  runtime.session.state.value.status,
  runtime.session.state.value.session?.id,
])
const groups = ref<Awaited<ReturnType<typeof runtime.devices.management.groups>>>(),
  ddm = ref<Awaited<ReturnType<typeof runtime.devices.management.ddm>>>()
const asset = useOriginalOperation(() => 'asset/' + props.device),
  state = ref<'active' | 'archived' | 'deleted'>('archived'),
  confirmation = ref(false),
  currentAssetState = ref<string>()
function clear() {
  groups.value = undefined
  ddm.value = undefined
  currentAssetState.value = undefined
}
watch(() => props.device, clear)
useSettingsFacts(clear)
async function load(kind: 'groups' | 'ddm', cursor?: string) {
  if (kind === 'groups') {
    groups.value = undefined
    await run(
      () => runtime.devices.management.groups(props.device, cursor),
      (v) => {
        groups.value = v
      },
    )
  } else {
    ddm.value = undefined
    await run(
      () => runtime.devices.management.ddm(props.device, cursor),
      (v) => {
        ddm.value = v
      },
    )
  }
  if (failure.value) clear()
}
async function compareAsset() {
  const ok = await asset.run(
    () => runtime.devices.views.detail({ kind: 'endpoint', id: props.device }),
    (v) => {
      currentAssetState.value = v.endpoints[0]!.assetState
    },
  )
  if (ok) asset.resolvedConflict()
}
function change(replay = false) {
  if (!confirmation.value) return
  confirmation.value = false
  void asset.submit(
    { state: state.value },
    (operation, original) =>
      runtime.devices.lifecycle.asset(
        { kind: 'endpoint', id: props.device },
        operation,
        original.state,
      ),
    (value) => {
      currentAssetState.value = value.state
    },
    replay,
  )
}
</script>
<template>
  <section class="console-panel" data-panel="device-management-queries" :aria-busy="busy">
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <h2>{{ t('gap.memberships') }}</h2>
    <v-btn :disabled="busy" @click="load('groups')">{{ t('gap.load') }}</v-btn>
    <p v-if="groups">{{ t('devices.association') }}: {{ groups.associationCurrent }}</p>
    <article v-for="g in groups?.items" :key="g.id">
      <h3>{{ g.presentation.name ?? g.id }}</h3>
      <p>{{ g.kind }} · {{ g.evaluation }} · {{ g.revision }} / {{ g.memberVersion }}</p>
      <v-expansion-panels
        ><v-expansion-panel>
          <v-expansion-panel-title>{{ t('devices.evidence') }}</v-expansion-panel-title>
          <v-expansion-panel-text>
            <pre>{{ JSON.stringify(g, null, 2) }}</pre>
          </v-expansion-panel-text>
        </v-expansion-panel></v-expansion-panels
      >
    </article>
    <v-btn v-if="groups?.nextCursor" :disabled="busy" @click="load('groups', groups.nextCursor)">{{
      t('gap.next')
    }}</v-btn>
    <h2>{{ t('gap.ddm') }}</h2>
    <v-btn :disabled="busy" @click="load('ddm')">{{ t('gap.load') }}</v-btn>
    <p v-if="ddm">{{ ddm.availability }} · {{ ddm.effect }} · {{ ddm.compliance }}</p>
    <article v-for="entry in ddm?.items" :key="entry.operationId">
      <p>{{ entry.registrationId }} / {{ entry.generation }} · {{ entry.userKey }}</p>
      <RouterLink
        :to="{
          name: 'policy-execution',
          params: { tenant: runtime.tenant, execution: entry.operationId },
          query: { device },
        }"
        >{{ entry.operationId }}</RouterLink
      >
      <v-expansion-panels
        ><v-expansion-panel>
          <v-expansion-panel-title>{{ t('devices.evidence') }}</v-expansion-panel-title>
          <v-expansion-panel-text>
            <pre>{{ JSON.stringify(entry.observation, null, 2) }}</pre>
          </v-expansion-panel-text>
        </v-expansion-panel></v-expansion-panels
      >
    </article>
    <v-btn v-if="ddm?.nextCursor" :disabled="busy" @click="load('ddm', ddm.nextCursor)">{{
      t('gap.next')
    }}</v-btn>
    <h2>{{ t('gap.assetState') }}</h2>
    <p v-if="asset.failure.value" role="alert">{{ t('devices.' + asset.failure.value) }}</p>
    <p v-if="currentAssetState">{{ t('gap.assetState') }}: {{ currentAssetState }}</p>
    <v-select
      v-model="state"
      :label="t('gap.assetState')"
      :disabled="asset.locked.value"
      :items="
        (['active', 'archived', 'deleted'] as const).map((value) => ({
          title: t('gap.' + value),
          value,
        }))
      "
    />
    <v-checkbox
      v-model="confirmation"
      :label="t('gap.confirmation')"
      :disabled="asset.busy.value"
    />
    <v-btn :disabled="asset.locked.value || !confirmation" @click="change()">{{
      t('gap.save')
    }}</v-btn>
    <template v-if="asset.pending.value"
      ><p role="alert">
        {{ t(asset.pending.value.state === 'conflict' ? 'gap.compare' : 'gap.unknown') }}
        {{ asset.pending.value.id }}
      </p>
      <v-btn
        v-if="asset.pending.value.state === 'unknown'"
        :disabled="asset.busy.value || !confirmation"
        @click="change(true)"
        >{{ t('gap.replayOriginal') }}</v-btn
      ><v-btn
        v-if="asset.pending.value.state === 'conflict'"
        :disabled="asset.busy.value"
        @click="compareAsset"
        >{{ t('gap.compare') }}</v-btn
      ></template
    >
  </section>
</template>
