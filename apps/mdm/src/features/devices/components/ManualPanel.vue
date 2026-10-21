<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { FieldDefinition, Inventory, ManualChange, Scalar } from '../clients/assets'
import { operation, useOperation } from '../../../services/useOperation'
import { editableField } from '../clients/asset-model'
import { deviceBinding } from '../useDeviceBinding'
import { assetLabel } from '../assetPresentation'
import ScalarEditor from './ScalarEditor.vue'
import AssetValue from './AssetValue.vue'
const props = defineProps<{ device: string; inventory: Inventory; fields: FieldDefinition[] }>()
const emit = defineEmits<{ updated: [value: Inventory] }>()
const { t, locale } = useI18n(),
  runtime = useMdm(),
  client = runtime.devices.assets,
  { busy, failure, uncertain, run, runWrite } = useOperation(
    [],
    () => deviceBinding(runtime),
    () => props.device,
  )
const key = ref(''),
  action = ref<'set' | 'null' | 'delete'>('set'),
  value = ref<Scalar>({ kind: 'string', value: '' })
const manual = computed(() => props.fields.filter(editableField).filter((f) => f.manual)),
  selected = computed(() => props.inventory.fields[key.value])
let pending: (() => Promise<void>) | undefined
watch(
  () => JSON.stringify([...deviceBinding(runtime), props.device]),
  () => {
    key.value = ''
    pending = undefined
    value.value = { kind: 'string', value: '' }
  },
  { flush: 'sync' },
)
function change() {
  const f = manual.value.find((f) => f.key === key.value)
  if (!f) return
  value.value =
    f.kind === 'boolean'
      ? { kind: f.kind, value: false }
      : f.kind === 'string'
        ? { kind: f.kind, value: '' }
        : { kind: f.kind, value: 0 }
}
function submit() {
  if (busy.value || uncertain.value || !key.value) return
  const device = props.device,
    field = key.value,
    input: ManualChange =
      action.value === 'set'
        ? { action: 'set', value: { ...value.value } }
        : { action: action.value }
  const body = operation(input, props.inventory.revisions[field] ?? 0)
  pending = async () => {
    if (await runWrite(() => client.assign(device, field, body)))
      await run(
        () => client.inventory(device),
        (v) => emit('updated', v),
      )
  }
  void pending()
}
</script>
<template>
  <section :aria-busy="busy">
    <h2>{{ t('devices.manual') }}</h2>
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <form @submit.prevent="submit">
      <fieldset :disabled="busy || uncertain">
        <label
          >{{ t('devices.field')
          }}<select v-model="key" class="ui-input" required @change="change">
            <option value="">—</option>
            <option v-for="f in manual" :key="f.key" :value="f.key">
              {{ assetLabel(f.key, locale) }}
            </option>
          </select></label
        >
        <template v-if="key"
          ><p>{{ t('devices.revision') }} {{ inventory.revisions[key] ?? 0 }}</p>
          <AssetValue v-if="selected" :field="selected" /><label
            >{{ t('devices.draft')
            }}<select v-model="action" class="ui-input">
              <option v-for="a in ['set', 'null', 'delete']" :key="a" :value="a">
                {{ t(`devices.${a}`) }}
              </option>
            </select></label
          ><ScalarEditor v-if="action === 'set'" v-model="value" /><UiButton type="submit">
            {{ t('devices.save') }}
          </UiButton></template
        >
      </fieldset>
    </form>
    <UiButton
      :disabled="!!busy"
      type="submit"
      @click="
        run(
          () => client.inventory(device),
          (v) => emit('updated', v),
        )
      "
    >
      {{ t('devices.compare') }}
    </UiButton>
    <UiButton v-if="uncertain && pending" :disabled="!!busy" type="submit" @click="pending!()">
      {{ t('devices.replay') }}
    </UiButton>
  </section>
</template>
