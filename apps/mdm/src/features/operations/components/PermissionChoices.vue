<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
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
const props = defineProps<{ realm: AuthorizationRealm }>(),
  model = defineModel<Grant[]>({ required: true }),
  { t } = useI18n()
const operation = ref<Grant['operation']>('inventory_read'),
  scope = ref('all_devices'),
  device = ref(''),
  invalid = ref(false)
const allowed = computed(() =>
  permissions.filter((p) => !(tenantAdministrationPermissions as readonly string[]).includes(p)),
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
    <label v-for="value in platformPermissions" :key="value" class="authorization-permission">
      <input
        type="checkbox"
        :value="value"
        :checked="model.some((g) => g.operation === value)"
        @change="toggle(value, ($event.target as HTMLInputElement).checked)"
      />
      <span
        ><strong>{{ t('operations.ruleUi.permissions.' + value) }}</strong
        ><small>{{ t('operations.ruleUi.permissionHints.' + value) }}</small></span
      >
    </label>
  </fieldset>
  <template v-else>
    <div class="settings-actions">
      <label
        >{{ t('operations.permission')
        }}<select v-model="operation" @change="changePermission">
          <option v-for="value in allowed" :key="value">{{ value }}</option>
        </select></label
      >
      <label
        >{{ t('operations.scope')
        }}<select v-model="scope">
          <option
            v-for="value in (devicePermissions as readonly string[]).includes(operation)
              ? ['all_devices', 'device']
              : ['tenant']"
            :key="value"
          >
            {{ value }}
          </option>
        </select></label
      >
      <label v-if="scope === 'device'"
        >{{ t('policies.device') }}<input v-model="device" required maxlength="256"
      /></label>
      <UiButton :disabled="model.length >= 256 || (scope === 'device' && !device)" @click="add">{{
        t('operations.addGrant')
      }}</UiButton>
    </div>
    <p v-if="invalid" role="alert">{{ t('devices.invalidRequest') }}</p>
    <div v-for="(g, index) in model" :key="JSON.stringify(g)" class="console-inline-actions">
      <GrantFacts :grants="[g]" /><UiButton @click="model = model.filter((_, i) => i !== index)">{{
        t('operations.ruleUi.removePermission')
      }}</UiButton>
    </div>
  </template>
</template>
