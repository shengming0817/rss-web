<script setup lang="ts">
import { useId, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UtcTimeInput from './UtcTimeInput.vue'
import { decodeSchedule, type Schedule, type Trigger } from '../clients/schedule'
const model = defineModel<Schedule>({ required: true })
const { t } = useI18n(),
  id = useId()
const invalid = computed(() => {
  try {
    decodeSchedule(model.value)
    return ''
  } catch {
    return t('policies.invalidSchedule')
  }
})
const triggers = ['manual', 'once', 'interval', 'weekly', 'registration', 'check_in'] as const
function trigger(event: Event) {
  const kind = (event.target as HTMLSelectElement).value as Trigger['kind']
  model.value.trigger =
    kind === 'manual' || kind === 'registration'
      ? { kind }
      : kind === 'once'
        ? { kind, at: Math.floor(Date.now() / 1000) + 3600 }
        : kind === 'interval'
          ? { kind, anchor: Math.floor(Date.now() / 1000), seconds: 3600 }
          : kind === 'check_in'
            ? { kind, minimumSeconds: 3600 }
            : { kind: 'weekly', zone: 'UTC', weekday: 1, minute: 120 }
}
function window(event: Event) {
  model.value.window = (event.target as HTMLInputElement).checked
    ? { zone: 'UTC', weekdays: [1, 2, 3, 4, 5], startMinute: 120, endMinute: 240 }
    : null
}
</script>
<template>
  <fieldset>
    <legend>{{ t('policies.schedule') }}</legend>
    <p>{{ t('policies.scheduleHint') }}</p>
    <p v-if="invalid" :id="`${id}-validation`" role="alert">{{ invalid }}</p>
    <label :for="`${id}-trigger`">{{ t('policies.trigger') }}</label
    ><select :id="`${id}-trigger`" :value="model.trigger.kind" @change="trigger">
      <option v-for="kind in triggers" :key="kind" :value="kind">
        {{ t(`policies.triggerKind.${kind}`) }}
      </option></select
    ><template v-if="model.trigger.kind === 'once'"
      ><label :for="`${id}-at`">{{ t('policies.at') }}</label
      ><UtcTimeInput :id="`${id}-at`" v-model="model.trigger.at" /></template
    ><template v-if="model.trigger.kind === 'interval'"
      ><label :for="`${id}-anchor`">{{ t('policies.anchor') }}</label
      ><UtcTimeInput :id="`${id}-anchor`" v-model="model.trigger.anchor" /><label
        :for="`${id}-seconds`"
        >{{ t('policies.seconds') }}</label
      ><input
        :id="`${id}-seconds`"
        v-model.number="model.trigger.seconds"
        type="number"
        min="60"
        max="31536000"
        required /></template
    ><template v-if="model.trigger.kind === 'check_in'"
      ><label :for="`${id}-minimum`">{{ t('policies.seconds') }}</label
      ><input
        :id="`${id}-minimum`"
        v-model.number="model.trigger.minimumSeconds"
        type="number"
        min="60"
        max="31536000"
        required /></template
    ><template v-if="model.trigger.kind === 'weekly'"
      ><label :for="`${id}-zone`">{{ t('policies.zone') }}</label
      ><input :id="`${id}-zone`" v-model="model.trigger.zone" required /><label
        :for="`${id}-weekday`"
        >{{ t('policies.weekday') }}</label
      ><input
        :id="`${id}-weekday`"
        v-model.number="model.trigger.weekday"
        type="number"
        min="1"
        max="7"
        required /><label :for="`${id}-minute`">{{ t('policies.minute') }}</label
      ><input
        :id="`${id}-minute`"
        v-model.number="model.trigger.minute"
        type="number"
        min="0"
        max="1439"
        required /></template
    ><label :for="`${id}-not-before`">{{ t('policies.notBefore') }}</label
    ><UtcTimeInput :id="`${id}-not-before`" v-model="model.notBefore" /><label
      :for="`${id}-until`"
      >{{ t('policies.until') }}</label
    ><UtcTimeInput
      :id="`${id}-until`"
      v-model="model.until"
      :error="invalid"
      :description="invalid ? `${id}-validation` : ''"
      :min="model.notBefore + 1"
      :max="model.notBefore + 366 * 86400"
    /><label :for="`${id}-jitter`">{{ t('policies.jitter') }}</label
    ><input
      :id="`${id}-jitter`"
      v-model.number="model.jitterSeconds"
      type="number"
      min="0"
      max="3600"
      required
    /><label :for="`${id}-misfire`">{{ t('policies.misfire') }}</label
    ><select :id="`${id}-misfire`" v-model="model.misfire">
      <option value="skip">{{ t('policies.skip') }}</option>
      <option value="coalesce_one">{{ t('policies.coalesce') }}</option></select
    ><label
      ><input :checked="model.window !== null" type="checkbox" @change="window" />{{
        t('policies.window')
      }}</label
    ><template v-if="model.window"
      ><label :for="`${id}-window-zone`">{{ t('policies.zone') }}</label
      ><input :id="`${id}-window-zone`" v-model="model.window.zone" required />
      <fieldset>
        <legend>{{ t('policies.weekday') }}</legend>
        <label v-for="day in 7" :key="day"
          ><input v-model="model.window.weekdays" type="checkbox" :value="day" />{{ day }}</label
        >
      </fieldset>
      <label :for="`${id}-window-start`">{{ t('policies.startMinute') }}</label
      ><input
        :id="`${id}-window-start`"
        v-model.number="model.window.startMinute"
        type="number"
        min="0"
        max="1439"
        required /><label :for="`${id}-window-end`">{{ t('policies.endMinute') }}</label
      ><input
        :id="`${id}-window-end`"
        v-model.number="model.window.endMinute"
        type="number"
        min="0"
        max="1440"
        required
    /></template>
  </fieldset>
</template>
