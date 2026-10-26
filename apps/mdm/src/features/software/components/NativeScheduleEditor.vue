<script setup lang="ts">
const props = defineProps<{ disabled?: boolean }>()
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { VAlert, VCheckbox, VSelect, VTextField } from 'vuetify/components'
import { nativeSchedule } from '../../policies/clients/model'
type Schedule = ReturnType<typeof nativeSchedule>
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
function trigger(kind: string) {
  const now = Math.floor(Date.now() / 1000)
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
function bound(enabled: boolean | null) {
  model.value.until = enabled ? model.value.notBefore + 86400 * 365 : null
}
function misfire(kind: string) {
  model.value.misfire =
    kind === 'skip' ? { kind: 'skip', maxLatenessSeconds: 30 } : { kind: 'coalesce_one' }
}
function window(enabled: boolean | null) {
  model.value.window = enabled
    ? { zone: 'UTC', weekdays: [1, 2, 3, 4, 5], startMinute: 120, endMinute: 240 }
    : null
}
function utc(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 253402300799
    ? new Date(value * 1000).toISOString().slice(0, 19)
    : ''
}
function seconds(value: string) {
  const normalized = value.length === 16 ? `${value}:00` : value
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(normalized)) return Number.NaN
  const result = Date.parse(`${normalized}Z`) / 1000
  return utc(result) === normalized ? result : Number.NaN
}
</script>
<template>
  <fieldset class="software-schedule">
    <legend>{{ t('policies.schedule') }}</legend>
    <p>{{ t('software.nativeScheduleHint') }}</p>
    <VAlert v-if="invalid" type="error">{{ t('policies.invalidSchedule') }}</VAlert>
    <VSelect
      :id="`${id}-trigger`"
      :label="t('policies.trigger')"
      :model-value="model.trigger.kind"
      :items="
        ['check_in', 'registration', 'once', 'interval', 'weekly', 'manual'].map((kind) => ({
          title: t(`policies.triggerKind.${kind}`),
          value: kind,
        }))
      "
      :disabled="props.disabled"
      @update:model-value="trigger"
    />
    <VAlert v-if="model.trigger.kind === 'manual'" type="info">{{
      t('software.manualScheduleHint')
    }}</VAlert>
    <VTextField
      v-if="model.trigger.kind === 'once'"
      :id="`${id}-at`"
      :label="t('policies.at') + ' · UTC'"
      type="datetime-local"
      step="1"
      :model-value="utc(model.trigger.at)"
      required
      :disabled="props.disabled"
      @update:model-value="model.trigger.at = seconds($event)"
    />
    <template v-if="model.trigger.kind === 'interval'">
      <VTextField
        :id="`${id}-anchor`"
        :label="t('policies.anchor') + ' · UTC'"
        type="datetime-local"
        step="1"
        :model-value="utc(model.trigger.anchor)"
        required
        :disabled="props.disabled"
        @update:model-value="model.trigger.anchor = seconds($event)"
      />
      <VTextField
        :id="`${id}-seconds`"
        v-model.number="model.trigger.seconds"
        :label="t('policies.seconds')"
        type="number"
        min="60"
        max="31536000"
        required
        :disabled="props.disabled"
      />
    </template>
    <VTextField
      v-if="model.trigger.kind === 'check_in'"
      :id="`${id}-minimum`"
      v-model.number="model.trigger.minimumSeconds"
      :label="t('policies.seconds')"
      type="number"
      min="60"
      max="31536000"
      required
      :disabled="props.disabled"
    />
    <template v-if="model.trigger.kind === 'weekly'">
      <VTextField
        :id="`${id}-zone`"
        v-model="model.trigger.zone"
        :label="t('policies.zone')"
        required
        :disabled="props.disabled"
      />
      <VTextField
        :id="`${id}-weekday`"
        v-model.number="model.trigger.weekday"
        :label="t('policies.weekday')"
        type="number"
        min="1"
        max="7"
        required
        :disabled="props.disabled"
      />
      <VTextField
        :id="`${id}-minute`"
        v-model.number="model.trigger.minute"
        :label="t('policies.minute')"
        type="number"
        min="0"
        max="1439"
        required
        :disabled="props.disabled"
      />
    </template>
    <VTextField
      :id="`${id}-not-before`"
      :label="t('policies.notBefore') + ' · UTC'"
      type="datetime-local"
      step="1"
      :model-value="utc(model.notBefore)"
      required
      :disabled="props.disabled"
      @update:model-value="model.notBefore = seconds($event)"
    />
    <VCheckbox
      data-field="until-enabled"
      :model-value="model.until !== null"
      :label="t('software.boundedSchedule')"
      :disabled="props.disabled"
      @update:model-value="bound"
    />
    <VTextField
      v-if="model.until !== null"
      :id="`${id}-until`"
      :label="t('policies.until') + ' · UTC'"
      type="datetime-local"
      step="1"
      :min="utc(model.notBefore + 1)"
      :model-value="utc(until)"
      required
      :disabled="props.disabled"
      @update:model-value="until = seconds($event)"
    />
    <VTextField
      :id="`${id}-jitter`"
      v-model.number="model.jitterSeconds"
      :label="t('policies.jitter')"
      type="number"
      min="0"
      max="3600"
      required
      :disabled="props.disabled"
    />
    <VSelect
      :id="`${id}-misfire`"
      data-field="misfire"
      :label="t('policies.misfire')"
      :model-value="model.misfire.kind"
      :items="[
        { title: t('policies.coalesce'), value: 'coalesce_one' },
        { title: t('policies.skip'), value: 'skip' },
      ]"
      :disabled="props.disabled"
      @update:model-value="misfire"
    />
    <VTextField
      v-if="model.misfire.kind === 'skip'"
      :id="`${id}-lateness`"
      v-model.number="model.misfire.maxLatenessSeconds"
      :label="t('software.maxLateness')"
      type="number"
      min="0"
      required
      :disabled="props.disabled"
    />
    <VCheckbox
      :model-value="model.window !== null"
      :label="t('policies.window')"
      :disabled="props.disabled"
      @update:model-value="window"
    />
    <template v-if="model.window">
      <p>{{ t('software.overnightWindow') }}</p>
      <VTextField
        :id="`${id}-window-zone`"
        v-model="model.window.zone"
        :label="t('policies.zone')"
        required
        :disabled="props.disabled"
      />
      <fieldset>
        <legend>{{ t('policies.weekday') }}</legend>
        <div class="d-flex flex-wrap">
          <VCheckbox
            v-for="day in 7"
            :key="day"
            v-model="model.window.weekdays"
            :value="day"
            :label="t('software.weekday' + day)"
            :disabled="props.disabled"
          />
        </div>
      </fieldset>
      <VTextField
        :id="`${id}-window-start`"
        v-model.number="model.window.startMinute"
        :label="t('policies.startMinute')"
        type="number"
        min="0"
        max="1439"
        required
        :disabled="props.disabled"
      />
      <VTextField
        :id="`${id}-window-end`"
        v-model.number="model.window.endMinute"
        :label="t('policies.endMinute')"
        type="number"
        min="0"
        max="1440"
        required
        :disabled="props.disabled"
      />
    </template>
  </fieldset>
</template>
<style scoped>
.software-schedule {
  border: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
</style>
