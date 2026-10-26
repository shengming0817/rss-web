<script setup lang="ts">
import { VDialog, VCard } from 'vuetify/components'
import { useDialogFocus } from '../../../ui/dialog-focus'
import { VBtn } from 'vuetify/components'
import { computed, ref, toRaw } from 'vue'

import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation, operation, type Operation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import { assetLabel } from '../assetPresentation'
import type { FieldDefinition, FieldDisplayGroup, FieldLayout } from '../clients/assets'
const props = defineProps<{ layout: FieldLayout; fields: FieldDefinition[] }>()
const emit = defineEmits<{ saved: [value: FieldLayout] }>()
const runtime = useMdm(),
  { t, locale } = useI18n()
const { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const open = ref(false),
  groups = ref<FieldDisplayGroup[]>([]),
  active = ref(''),
  search = ref(''),
  compared = ref(false)
let pending: Operation<{ groups: FieldDisplayGroup[] }> | undefined
const current = computed(() => groups.value.find((g) => g.id === active.value))
const available = computed(() =>
  props.fields.filter(
    (f) =>
      f.key.startsWith('custom.') &&
      assetLabel(f.key, locale.value).toLowerCase().includes(search.value.toLowerCase()),
  ),
)
const valid = computed(() =>
  groups.value.every(
    (g) =>
      g.name.trim().length > 0 &&
      [...g.name.trim()].length <= 40 &&
      g.fields.length > 0 &&
      g.fields.every((key) => props.fields.some((f) => f.key === key)),
  ),
)
function begin() {
  if (uncertain.value || pending) {
    open.value = true
    return
  }
  groups.value = structuredClone(toRaw(props.layout.groups))
  active.value = groups.value[0]?.id ?? ''
  compared.value = false
  pending = undefined
  open.value = true
}
function add() {
  const group = { id: crypto.randomUUID(), name: t('devices.newFieldGroup'), fields: [] }
  groups.value.push(group)
  active.value = group.id
}
function move<T>(items: T[], index: number, delta: number) {
  const next = index + delta
  if (next < 0 || next >= items.length) return
  const [item] = items.splice(index, 1)
  items.splice(next, 0, item!)
}
function toggle(key: string) {
  if (!current.value) return
  const i = current.value.fields.indexOf(key)
  if (i < 0) current.value.fields.push(key)
  else current.value.fields.splice(i, 1)
}
async function compare() {
  await run(
    () => runtime.devices.assets.fieldLayout(),
    (value) => {
      emit('saved', value)
      compared.value = true
    },
  )
}
function reedit() {
  failure.value = null
  groups.value = structuredClone(toRaw(props.layout.groups))
  pending = undefined
  compared.value = false
  active.value = groups.value[0]?.id ?? ''
}
async function save(replay = false) {
  if (!valid.value || (uncertain.value && (!replay || !compared.value))) return
  const body = replay
    ? pending
    : operation({ groups: structuredClone(toRaw(groups.value)) }, props.layout.revision)
  if (!body) return
  pending = body
  if (await runWrite(() => runtime.devices.assets.saveFieldLayout(body))) {
    await run(
      () => runtime.devices.assets.fieldLayout(),
      (value) => {
        emit('saved', value)
        open.value = false
        pending = undefined
      },
    )
  }
}
const restoreDialogFocus = useDialogFocus(open)
</script>
<template>
  <v-btn v-if="layout.editable" data-action="manage-field-groups" @click="begin">{{
    t('devices.manageFieldGroups')
  }}</v-btn>
  <v-dialog
    :model-value="open"
    :aria-label="t('devices.manageFieldGroups')"
    :data-state="open ? 'open' : 'closed'"
    @update:model-value="open = $event"
    @after-leave="restoreDialogFocus"
    ><v-card :title="t('devices.manageFieldGroups')"
      ><div class="device-dialog-body">
        <p>{{ t('devices.fieldGroupsNote') }}</p>
        <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
        <div class="field-layout-editor">
          <div>
            <v-btn :disabled="busy || uncertain" @click="add">{{
              t('devices.addFieldGroup')
            }}</v-btn>
            <ol class="field-group-list">
              <li v-for="(group, index) in groups" :key="group.id">
                <v-btn :aria-pressed="active === group.id" @click="active = group.id"
                  >{{ group.name || t('devices.newFieldGroup') }} · {{ group.fields.length }}</v-btn
                >
                <v-btn
                  :disabled="busy || uncertain || index === 0"
                  :aria-label="t('devices.moveUp')"
                  @click="move(groups, index, -1)"
                  >↑</v-btn
                >
                <v-btn
                  :disabled="busy || uncertain || index === groups.length - 1"
                  :aria-label="t('devices.moveDown')"
                  @click="move(groups, index, 1)"
                  >↓</v-btn
                >
                <v-btn :disabled="busy || uncertain" @click="groups.splice(index, 1)">{{
                  t('devices.removeFieldGroup')
                }}</v-btn>
              </li>
            </ol>
          </div>
          <fieldset
            v-if="current"
            :disabled="busy || uncertain || (failure === 'conflict' && !compared)"
          >
            <label
              >{{ t('devices.fieldGroupName')
              }}<input v-model="current.name" class="ui-input" maxlength="40"
            /></label>
            <label
              >{{ t('devices.searchFields')
              }}<input v-model="search" class="ui-input" type="search"
            /></label>
            <div v-for="field in available" :key="field.key" class="field-choice">
              <label
                ><input
                  type="checkbox"
                  :checked="current.fields.includes(field.key)"
                  @change="toggle(field.key)"
                />
                {{ assetLabel(field.key, locale) }}
                <small
                  >{{ field.manual ? t('devices.manualField') : t('devices.collectedField') }} ·
                  {{ field.sensitivity }}</small
                ></label
              >
            </div>
            <ol>
              <li v-for="(key, index) in current.fields" :key="key">
                {{ assetLabel(key, locale)
                }}<v-btn
                  type="button"
                  :aria-label="t('devices.moveUp')"
                  :disabled="index === 0"
                  @click="move(current.fields, index, -1)"
                  >↑</v-btn
                ><v-btn
                  type="button"
                  :aria-label="t('devices.moveDown')"
                  :disabled="index === current.fields.length - 1"
                  @click="move(current.fields, index, 1)"
                  >↓</v-btn
                >
              </li>
            </ol>
            <p v-if="!current.fields.length">{{ t('devices.fieldGroupEmpty') }}</p>
          </fieldset>
        </div>
      </div>
      <template #actions
        ><v-btn variant="text" @click="open = false">{{ t('console.cancel') }}</v-btn
        ><template v-if="uncertain || failure === 'conflict'"
          ><v-btn :disabled="busy" @click="compare">{{ t('devices.compare') }}</v-btn
          ><v-btn v-if="compared && !uncertain" @click="reedit">{{ t('console.edit') }}</v-btn
          ><v-btn v-if="compared && uncertain" :disabled="busy" @click="save(true)">{{
            t('devices.replay')
          }}</v-btn></template
        ><v-btn v-else :disabled="busy || !valid" @click="save()">{{
          t('devices.saveFieldGroups')
        }}</v-btn></template
      >
    </v-card></v-dialog
  >
</template>
