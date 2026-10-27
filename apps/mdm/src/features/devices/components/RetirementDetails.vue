<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { VBtn, VTextarea, VCheckbox } from 'vuetify/components'
import { useMdm } from '../../../context'
import { useOriginalOperation } from '../../../services/useOriginalOperation'
import type { retirement } from '../clients/lifecycle'
const props = defineProps<{ id: string }>(),
  runtime = useMdm(),
  { t } = useI18n()
const { run, submit, pending, locked, busy, failure } = useOriginalOperation(
  () => 'retirement/' + props.id,
)
const value = ref<ReturnType<typeof retirement>>(),
  reason = ref(''),
  confirmation = ref(false)
async function load() {
  value.value = undefined
  await run(
    () => runtime.devices.lifecycle.read(props.id),
    (v) => {
      value.value = v
    },
  )
}
watch(() => props.id, load, { immediate: true })
async function force(replay = false) {
  if (!confirmation.value) return
  confirmation.value = false
  const ok = await submit(
    { reason: reason.value },
    (operation, input) => runtime.devices.lifecycle.force(props.id, operation, input.reason),
    () => {},
    replay,
  )
  if (ok) await load()
}
</script>
<template>
  <section class="console-panel" :aria-busy="busy" data-panel="retirement">
    <h3>{{ t('gap.retire') }} · {{ id }}</h3>
    <p>{{ t('gap.retirementHint') }}</p>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <v-btn :disabled="busy" @click="load">{{ t('gap.load') }}</v-btn>
    <article v-for="channel in value?.channels" :key="channel.registration">
      <h4>{{ channel.device }} · {{ channel.channel }}</h4>
      <p>
        {{ channel.registration }} / {{ channel.generation }} · {{ channel.stage }} ·
        {{ channel.effect }}
      </p>
      <p v-if="channel.reason">{{ channel.reason }}</p>
      <RouterLink
        v-for="operation in [channel.execution, channel.blockingExecution].filter(Boolean)"
        :key="operation!"
        :to="{
          name: 'policy-execution',
          params: { tenant: runtime.tenant, execution: operation! },
          query: { device: channel.device },
        }"
        >{{ operation }}</RouterLink
      >
    </article>
    <v-textarea v-model="reason" :label="t('gap.reason')" :disabled="locked" maxlength="2048" />
    <v-checkbox v-model="confirmation" :label="t('gap.confirmation')" :disabled="busy" />
    <v-btn :disabled="locked || !confirmation || !reason.trim()" @click="force()">{{
      t('gap.force')
    }}</v-btn>
    <template v-if="pending"
      ><p role="alert">{{ t('gap.unknown') }} {{ pending.id }}</p>
      <v-btn
        v-if="pending.state === 'unknown'"
        :disabled="busy || !confirmation"
        @click="force(true)"
        >{{ t('gap.replayOriginal') }}</v-btn
      ></template
    >
  </section>
</template>
