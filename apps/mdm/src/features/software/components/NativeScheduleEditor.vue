<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import UtcTimeInput from '../../policies/components/UtcTimeInput.vue'
import { type SoftwarePolicyDefinition } from '../clients/assignment-model'
import { nativeSchedule } from '../../policies/clients/model'
type Schedule = SoftwarePolicyDefinition['action']['schedule']
const model = defineModel<Schedule>({ required: true })
const id = useId(),
  { t } = useI18n()
const until = computed({
  get: () => model.value.until ?? 0,
  set: (v: number) => {
    model.value.until = v
  },
})
const invalid = computed(() => {
  try {
    nativeSchedule(model.value)
    return false
  } catch {
    return true
  }
})
function trigger(event: Event) {
  const kind = (event.target as HTMLSelectElement).value,
    now = Math.floor(Date.now() / 1000)
  model.value.trigger =
    kind === 'manual' || kind === 'registration'
      ? { kind }
      : kind === 'once'
        ? { kind, at: now + 3600 }
        : kind === 'interval'
          ? { kind, anchor: now, seconds: 3600 }
          : kind === 'weekly'
            ? { kind, zone: 'UTC', weekday: 1, minute: 120 }
            : { kind: 'check_in', minimumSeconds: 3600 }
}
function bound(event: Event) {
  model.value.until = (event.target as HTMLInputElement).checked
    ? model.value.notBefore + 86400 * 365
    : null
}
function misfire(event: Event) {
  model.value.misfire =
    (event.target as HTMLSelectElement).value === 'skip'
      ? { kind: 'skip', maxLatenessSeconds: 30 }
      : { kind: 'coalesce_one' }
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
    <p>{{ t('software.nativeScheduleHint') }}</p>
    <p v-if="invalid" role="alert">{{ t('policies.invalidSchedule') }}</p>
    <label :for="`${id}-trigger`">{{ t('policies.trigger') }}</label
    ><select :id="`${id}-trigger`" :value="model.trigger.kind" @change="trigger">
      <option
        v-for="kind in ['check_in', 'registration', 'once', 'interval', 'weekly', 'manual']"
        :key="kind"
        :value="kind"
      >
        {{ t(`policies.triggerKind.${kind}`) }}
      </option>
    </select>
    <p v-if="model.trigger.kind === 'manual'" role="status">
      {{ t('software.manualScheduleHint') }}
    </p>
    <template v-if="model.trigger.kind === 'once'"
      ><label :for="`${id}-at`">{{ t('policies.at') }}</label
      ><UtcTimeInput :id="`${id}-at`" v-model="model.trigger.at"
    /></template>
    <template v-if="model.trigger.kind === 'interval'"
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
        required
    /></template>
    <template v-if="model.trigger.kind === 'check_in'"
      ><label :for="`${id}-minimum`">{{ t('policies.seconds') }}</label
      ><input
        :id="`${id}-minimum`"
        v-model.number="model.trigger.minimumSeconds"
        type="number"
        min="60"
        max="31536000"
        required
    /></template>
    <template v-if="model.trigger.kind === 'weekly'"
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
        required
    /></template>
    <label :for="`${id}-not-before`">{{ t('policies.notBefore') }}</label
    ><UtcTimeInput :id="`${id}-not-before`" v-model="model.notBefore" />
    <label
      ><input
        data-field="until-enabled"
        type="checkbox"
        :checked="model.until !== null"
        @change="bound"
      />{{ t('software.boundedSchedule') }}</label
    >
    <template v-if="model.until !== null"
      ><label :for="`${id}-until`">{{ t('policies.until') }}</label
      ><UtcTimeInput :id="`${id}-until`" v-model="until" :min="model.notBefore + 1"
    /></template>
    <label :for="`${id}-jitter`">{{ t('policies.jitter') }}</label
    ><input
      :id="`${id}-jitter`"
      v-model.number="model.jitterSeconds"
      type="number"
      min="0"
      max="3600"
      required
    />
    <label :for="`${id}-misfire`">{{ t('policies.misfire') }}</label
    ><select
      :id="`${id}-misfire`"
      data-field="misfire"
      :value="model.misfire.kind"
      @change="misfire"
    >
      <option value="coalesce_one">{{ t('policies.coalesce') }}</option>
      <option value="skip">{{ t('policies.skip') }}</option>
    </select>
    <template v-if="model.misfire.kind === 'skip'"
      ><label :for="`${id}-lateness`">{{ t('software.maxLateness') }}</label
      ><input
        :id="`${id}-lateness`"
        v-model.number="model.misfire.maxLatenessSeconds"
        type="number"
        min="0"
        required
    /></template>
    <label
      ><input type="checkbox" :checked="model.window !== null" @change="window" />{{
        t('policies.window')
      }}</label
    >
    <template v-if="model.window">
      <p>{{ t('software.overnightWindow') }}</p>
      <label :for="`${id}-window-zone`">{{ t('policies.zone') }}</label
      ><input :id="`${id}-window-zone`" v-model="model.window.zone" required />
      <fieldset>
        <legend>{{ t('policies.weekday') }}</legend>
        <label v-for="day in 7" :key="day"
          ><input v-model="model.window.weekdays" type="checkbox" :value="day" />{{
            t('software.weekday' + day)
          }}</label
        >
      </fieldset>
      <label :for="`${id}-window-start`">{{ t('policies.startMinute') }}</label
      ><input
        :id="`${id}-window-start`"
        v-model.number="model.window.startMinute"
        type="number"
        min="0"
        max="1439"
        required
      />
      <label :for="`${id}-window-end`">{{ t('policies.endMinute') }}</label
      ><input
        :id="`${id}-window-end`"
        v-model.number="model.window.endMinute"
        type="number"
        min="0"
        max="1440"
        required
      />
    </template>
  </fieldset>
</template>
