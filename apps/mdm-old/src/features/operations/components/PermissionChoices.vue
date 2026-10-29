<script setup lang="ts">
import { VBtn, VCheckbox, VSelect, VTextField } from 'vuetify/components'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  devicePermissions,
  permissions,
  platformPermissions,
  tenantAdministrationPermissions,
  grant,
  type Grant,
  type AuthorizationRealm,
} from '../clients/authorization'
import GrantFacts from './GrantFacts.vue'
const props = defineProps<{
    realm: AuthorizationRealm
    operations?: readonly Grant['operation'][]
  }>(),
  model = defineModel<Grant[]>({ required: true }),
  { t } = useI18n()
const operation = ref<Grant['operation']>('inventory_read'),
  scope = ref('all_devices'),
  device = ref(''),
  invalid = ref(false)
const allowed = computed(() =>
  permissions.filter(
    (p) =>
      !(tenantAdministrationPermissions as readonly string[]).includes(p) &&
      (!props.operations || props.operations.includes(p)),
  ),
)
function toggle(operation: Grant['operation'], checked: boolean) {
  model.value = checked
    ? [...model.value, { operation, scope: { kind: 'tenant' } }]
    : model.value.filter((g) => g.operation !== operation)
}
function add() {
  invalid.value = false
  try {
    const value = grant({
      operation: operation.value,
      scope:
        scope.value === 'device' ? { kind: 'device', id: device.value } : { kind: scope.value },
    })
    if (
      model.value.length < 256 &&
      !model.value.some((g) => JSON.stringify(g) === JSON.stringify(value))
    )
      model.value = [...model.value, value]
  } catch {
    invalid.value = true
  }
}
function changePermission() {
  scope.value = (devicePermissions as readonly string[]).includes(operation.value)
    ? 'all_devices'
    : 'tenant'
}
</script>
<template>
  <fieldset v-if="props.realm === 'platform'" class="authorization-permissions">
    <legend>{{ t('operations.ruleUi.choosePermissions') }}</legend>
    <VCheckbox
      v-for="value in platformPermissions"
      :key="value"
      :model-value="model.some((g) => g.operation === value)"
      :label="t('operations.ruleUi.permissions.' + value)"
      :hint="t('operations.ruleUi.permissionHints.' + value)"
      persistent-hint
      @update:model-value="toggle(value, !!$event)"
    />
  </fieldset>
  <template v-else>
    <div class="settings-actions">
      <VSelect
        id="authorization-permission"
        v-model="operation"
        :items="[...allowed.map((value) => ({ title: value, value: value }))]"
        :label="t('operations.permission')"
        @update:model-value="changePermission"
      />
      <VSelect
        v-model="scope"
        :items="[
          ...((devicePermissions as readonly string[]).includes(operation)
            ? ['all_devices', 'device']
            : ['tenant']
          ).map((value) => ({ title: value, value: value })),
        ]"
        :label="t('operations.scope')"
      />
      <VTextField
        v-if="scope === 'device'"
        v-model="device"
        required
        maxlength="256"
        :label="t('policies.device')"
      />
      <VBtn :disabled="model.length >= 256 || (scope === 'device' && !device)" @click="add">{{
        t('operations.addGrant')
      }}</VBtn>
    </div>
    <p v-if="invalid" role="alert">{{ t('devices.invalidRequest') }}</p>
    <div v-for="(g, index) in model" :key="JSON.stringify(g)" class="console-inline-actions">
      <GrantFacts :grants="[g]" /><VBtn @click="model = model.filter((_, i) => i !== index)">{{
        t('operations.ruleUi.removePermission')
      }}</VBtn>
    </div>
  </template>
</template>
