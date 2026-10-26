<script setup lang="ts">
import { VSelect, VTextField, VCheckbox } from 'vuetify/components'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CollectionScope } from '../clients/asset-model'
const model = defineModel<CollectionScope>({ required: true })
const { t } = useI18n()
const kinds = [
  'device',
  'apple_user',
  'native_certificates',
  'native_accounts',
  'native_application',
  'native_user',
  'macos_applications',
  'macos_brew',
] as const
const fields = computed(() => {
  const value = model.value
  return Object.entries(value).filter(([key]) => !['kind', 'owner'].includes(key))
})
function changeKind(kind: CollectionScope['kind']) {
  const scopes: Record<CollectionScope['kind'], CollectionScope> = {
    device: { kind: 'device' },
    apple_user: { kind: 'apple_user', identity: '' },
    native_certificates: {
      kind: 'native_certificates',
      platform: 'windows',
      store: 'my',
      owner: null,
    },
    native_accounts: { kind: 'native_accounts', platform: 'windows', identities: [] },
    native_application: {
      kind: 'native_application',
      platform: 'windows',
      identity: '',
      owner: null,
    },
    native_user: { kind: 'native_user', owner: { kind: 'windows', sid: '' } },
    macos_applications: { kind: 'macos_applications', root: 'local', uid: null },
    macos_brew: {
      kind: 'macos_brew',
      uid: 1,
      prefix: '/opt/homebrew',
      package: 'formula',
      taps: [],
    },
  }
  model.value = scopes[kind]
}
function choices(key: string): string[] {
  if (key === 'platform') return ['windows', 'macos']
  if (key === 'root') return ['local', 'system', 'user']
  if (key === 'package') return ['formula', 'cask']
  if (key === 'store')
    return 'platform' in model.value && model.value.platform === 'macos'
      ? ['system', 'system_roots', 'login']
      : ['my', 'root', 'ca', 'trusted_publisher']
  return []
}
function update(key: string, value: unknown) {
  const next = { ...model.value, [key]: value }
  if (key === 'platform' && 'owner' in next) next.owner = null
  if (key === 'platform' && next.kind === 'native_certificates')
    next.store = value === 'macos' ? 'system' : 'my'
  if (key === 'root' && next.kind === 'macos_applications') next.uid = value === 'user' ? 1 : null
  if (key === 'store' && next.kind === 'native_certificates' && next.platform === 'macos')
    next.owner = value === 'login' ? { kind: 'macos', uid: 1, generated_uid: '' } : null
  model.value = next as CollectionScope
}
function ownerPlatform(value: 'windows' | 'macos') {
  update(
    'owner',
    value === 'windows' ? { kind: value, sid: '' } : { kind: value, uid: 1, generated_uid: '' },
  )
}
function ownerValue(key: string, value: string | number) {
  if ('owner' in model.value && model.value.owner)
    update('owner', { ...model.value.owner, [key]: key === 'uid' ? Number(value) : value })
}
</script>
<template>
  <div class="condition-scope-fields">
    <v-select
      :model-value="model.kind"
      :label="t('devices.conditionScope')"
      :items="kinds.map((value) => ({ value, title: t('devices.scopeKind.' + value) }))"
      @update:model-value="changeKind"
    />
    <template v-for="[key, value] in fields" :key="key">
      <v-select
        v-if="choices(key).length"
        :model-value="value"
        :label="t('devices.scopeField.' + key)"
        :items="choices(key).map((value) => ({ value, title: t('devices.scopeValue.' + value) }))"
        @update:model-value="update(key, $event)"
      />
      <v-text-field
        v-else-if="Array.isArray(value)"
        :model-value="value.join(', ')"
        :label="t('devices.scopeField.' + key)"
        @update:model-value="
          update(
            key,
            $event
              .split(',')
              .map((v: string) => v.trim())
              .filter(Boolean),
          )
        "
      />
      <v-text-field
        v-else
        :model-value="value ?? ''"
        :label="t('devices.scopeField.' + key)"
        :type="key === 'uid' ? 'number' : 'text'"
        :required="value !== null"
        :min="key === 'uid' ? 1 : undefined"
        @update:model-value="update(key, key === 'uid' ? Number($event) : $event)"
      />
    </template>
    <template v-if="'owner' in model">
      <v-checkbox
        v-if="model.kind !== 'native_user'"
        :model-value="!!model.owner"
        :label="t('devices.scopeOwner')"
        @update:model-value="
          $event
            ? ownerPlatform('platform' in model ? model.platform : 'windows')
            : update('owner', null)
        "
      />
      <template v-if="model.owner">
        <v-select
          :model-value="model.owner.kind"
          :label="t('devices.scopeField.platform')"
          :disabled="'platform' in model"
          :items="[
            { value: 'windows', title: 'Windows' },
            { value: 'macos', title: 'macOS' },
          ]"
          @update:model-value="ownerPlatform"
        />
        <v-text-field
          v-if="model.owner.kind === 'windows'"
          :model-value="model.owner.sid"
          label="SID"
          required
          @update:model-value="ownerValue('sid', $event)"
        />
        <template v-else
          ><v-text-field
            :model-value="model.owner.uid"
            label="UID"
            type="number"
            min="1"
            required
            @update:model-value="ownerValue('uid', $event)" /><v-text-field
            :model-value="model.owner.generated_uid"
            label="GeneratedUID"
            required
            @update:model-value="ownerValue('generated_uid', $event)"
        /></template>
      </template>
    </template>
  </div>
</template>
