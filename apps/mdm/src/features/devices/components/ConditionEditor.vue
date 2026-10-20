<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { deviceCondition, type InventoryCondition } from '../clients/asset-model'
import type { FieldDefinition, Criteria } from '../clients/asset-model'
import CriteriaEditor from './CriteriaEditor.vue'
import ScopeEditor from './ScopeEditor.vue'
defineProps<{ fields: FieldDefinition[] }>()
const model = defineModel<InventoryCondition | null>({ required: true })
const { t } = useI18n()
const selection = computed(() => model.value?.selector.kind ?? 'unfiltered')
function select(kind: string) {
  if (kind === 'unfiltered') {
    model.value = null
    return
  }
  const selector: InventoryCondition['selector'] =
    kind === 'exact'
      ? { kind, scope: { kind: 'device' } }
      : kind === 'local_user'
        ? { kind, platform: 'windows', identity: '' }
        : kind === 'all_authorized'
          ? { kind }
          : { kind: 'device' }
  model.value = {
    selector,
    quantifier: kind === 'device' || kind === 'exact' ? 'one' : 'any',
    criteria: model.value?.criteria ?? { kind: 'and', children: [] },
  }
}
function predicate(value: Criteria | null) {
  model.value = {
    ...(model.value ?? deviceCondition()),
    criteria: value ?? { kind: 'and', children: [] },
  }
}
</script>
<template>
  <section class="inventory-condition">
    <details :open="!!model && model.selector.kind !== 'device'">
      <summary>{{ t('devices.conditionContext') }}</summary>
      <label
        >{{ t('devices.conditionScope')
        }}<select
          class="ui-input"
          :value="selection"
          @change="select(($event.target as HTMLSelectElement).value)"
        >
          <option value="unfiltered">{{ t('devices.all') }}</option>
          <option
            v-for="kind in ['device', 'exact', 'local_user', 'all_authorized']"
            :key="kind"
            :value="kind"
          >
            {{ t(`devices.selectorKind.${kind}`) }}
          </option>
        </select></label
      >
      <template v-if="model">
        <ScopeEditor v-if="model.selector.kind === 'exact'" v-model="model.selector.scope" />
        <template v-if="model.selector.kind === 'local_user'"
          ><label
            >{{ t('devices.scopeField.platform')
            }}<select v-model="model.selector.platform" class="ui-input">
              <option value="windows">Windows</option>
              <option value="macos">macOS</option>
            </select></label
          ><label
            >{{ model.selector.platform === 'windows' ? 'SID' : 'UID'
            }}<input v-model="model.selector.identity" class="ui-input" required /></label
        ></template>
        <label
          >{{ t('devices.conditionQuantifier')
          }}<select
            v-model="model.quantifier"
            class="ui-input"
            :disabled="model.selector.kind === 'device' || model.selector.kind === 'exact'"
          >
            <option
              v-if="model.selector.kind === 'device' || model.selector.kind === 'exact'"
              value="one"
            >
              {{ t('devices.quantifier.one') }}
            </option>
            <template v-else
              ><option value="any">{{ t('devices.quantifier.any') }}</option>
              <option value="all">{{ t('devices.quantifier.all') }}</option></template
            >
          </select></label
        >
      </template>
    </details>
    <CriteriaEditor
      :model-value="model?.criteria ?? null"
      :fields="fields"
      @update:model-value="predicate"
    />
  </section>
</template>
