<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
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
    <UiButton :disabled="busy" @click="load">{{ t('gap.load') }}</UiButton>
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
    <label
      >{{ t('gap.reason') }}<textarea v-model="reason" :disabled="locked" maxlength="2048" /></label
    ><label><input v-model="confirmation" type="checkbox" />{{ t('gap.confirmation') }}</label>
    <UiButton :disabled="locked || !confirmation || !reason.trim()" @click="force()">{{
      t('gap.force')
    }}</UiButton>
    <template v-if="pending"
      ><p role="alert">{{ t('gap.unknown') }} {{ pending.id }}</p>
      <UiButton
        v-if="pending.state === 'unknown'"
        :disabled="busy || !confirmation"
        @click="force(true)"
        >{{ t('gap.replayOriginal') }}</UiButton
      ></template
    >
  </section>
</template>
