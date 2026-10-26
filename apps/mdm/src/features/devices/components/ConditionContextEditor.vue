<script setup lang="ts">
import {
  VExpansionPanels,
  VExpansionPanel,
  VExpansionPanelText,
  VSelect,
  VTextField,
} from 'vuetify/components'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { type ConditionContext, type CollectionScope } from '../clients/asset-model'
import ScopeEditor from './ScopeEditor.vue'
const model = defineModel<ConditionContext | null>({ required: true })
const { t } = useI18n()
const selection = computed(() => model.value?.selector.kind ?? 'unfiltered')
function select(kind: string) {
  if (kind === 'unfiltered') {
    model.value = null
    return
  }
  const selector: ConditionContext['selector'] =
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
  }
}
function updateSelector(selector: ConditionContext['selector']) {
  if (model.value) model.value = { ...model.value, selector }
}
function exactScope(scope: CollectionScope) {
  updateSelector({ kind: 'exact', scope })
}
function localUser(key: 'platform' | 'identity', value: string) {
  if (model.value?.selector.kind === 'local_user')
    updateSelector({ ...model.value.selector, [key]: value } as ConditionContext['selector'])
}
function quantifier(value: string) {
  if (model.value)
    model.value = { ...model.value, quantifier: value as ConditionContext['quantifier'] }
}
</script>
<template>
  <v-expansion-panels :model-value="model && model.selector.kind !== 'device' ? 0 : undefined"
    ><v-expansion-panel :title="t('devices.conditionContext')"
      ><v-expansion-panel-text eager>
        <v-select
          :model-value="selection"
          :label="t('devices.conditionScope')"
          :items="[
            { value: 'unfiltered', title: t('devices.all') },
            ...['device', 'exact', 'local_user', 'all_authorized'].map((value) => ({
              value,
              title: t('devices.selectorKind.' + value),
            })),
          ]"
          @update:model-value="select"
        />
        <template v-if="model">
          <ScopeEditor
            v-if="model.selector.kind === 'exact'"
            :model-value="model.selector.scope"
            @update:model-value="exactScope"
          />
          <template v-if="model.selector.kind === 'local_user'">
            <v-select
              :model-value="model.selector.platform"
              :label="t('devices.scopeField.platform')"
              :items="[
                { value: 'windows', title: 'Windows' },
                { value: 'macos', title: 'macOS' },
              ]"
              @update:model-value="localUser('platform', $event)"
            />
            <v-text-field
              :model-value="model.selector.identity"
              :label="model.selector.platform === 'windows' ? 'SID' : 'UID'"
              required
              @update:model-value="localUser('identity', $event)"
            />
          </template>
          <v-select
            :model-value="model.quantifier"
            :label="t('devices.conditionQuantifier')"
            :disabled="model.selector.kind === 'device' || model.selector.kind === 'exact'"
            :items="
              (model.selector.kind === 'device' || model.selector.kind === 'exact'
                ? ['one']
                : ['any', 'all']
              ).map((value) => ({ value, title: t('devices.quantifier.' + value) }))
            "
            @update:model-value="quantifier"
          />
        </template> </v-expansion-panel-text></v-expansion-panel
  ></v-expansion-panels>
</template>
