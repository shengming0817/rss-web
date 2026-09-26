<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { FieldDefinition, Inventory, ManualChange, Scalar } from '../clients/assets'
import { operation, useOperation } from '../../../services/useOperation'
import ScalarEditor from './ScalarEditor.vue'
import AssetValue from './AssetValue.vue'
const props = defineProps<{ device: string; inventory: Inventory; fields: FieldDefinition[] }>()
const emit = defineEmits<{ updated: [value: Inventory] }>()
const { t } = useI18n(),
  client = useMdm().devices.assets,
  { busy, failure, uncertain, run, runWrite } = useOperation()
const key = ref(''),
  action = ref<'set' | 'null' | 'delete'>('set'),
  value = ref<Scalar>({ kind: 'string', value: '' })
const manual = computed(() => props.fields.filter((f) => f.manual)),
  selected = computed(() => props.inventory.fields[key.value])
let pending: (() => Promise<void>) | undefined
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
          }}<select v-model="key" required @change="change">
            <option value="">—</option>
            <option v-for="f in manual" :key="f.key" :value="f.key">{{ f.key }}</option>
          </select></label
        >
        <template v-if="key"
          ><p>{{ t('devices.revision') }} {{ inventory.revisions[key] ?? 0 }}</p>
          <AssetValue v-if="selected" :field="selected" /><label
            >{{ t('devices.draft')
            }}<select v-model="action">
              <option v-for="a in ['set', 'null', 'delete']" :key="a" :value="a">
                {{ t(`devices.${a}`) }}
              </option>
            </select></label
          ><ScalarEditor v-if="action === 'set'" v-model="value" /><button>
            {{ t('devices.save') }}
          </button></template
        >
      </fieldset>
    </form>
    <button
      :disabled="busy"
      @click="
        run(
          () => client.inventory(device),
          (v) => emit('updated', v),
        )
      "
    >
      {{ t('devices.compare') }}
    </button>
    <button v-if="uncertain && pending" :disabled="busy" @click="pending!()">
      {{ t('devices.replay') }}
    </button>
  </section>
</template>
