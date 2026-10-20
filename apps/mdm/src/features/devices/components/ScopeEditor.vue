<script setup lang="ts">
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
function ownerField(key: string, event: Event) {
  if ('owner' in model.value && model.value.owner)
    update('owner', {
      ...model.value.owner,
      [key]:
        key === 'uid'
          ? Number((event.target as HTMLInputElement).value)
          : (event.target as HTMLInputElement).value,
    })
}
</script>
<template>
  <div class="condition-scope-fields">
    <label
      >{{ t('devices.conditionScope')
      }}<select
        class="ui-input"
        :value="model.kind"
        @change="changeKind(($event.target as HTMLSelectElement).value as CollectionScope['kind'])"
      >
        <option v-for="kind in kinds" :key="kind" :value="kind">
          {{ t(`devices.scopeKind.${kind}`) }}
        </option>
      </select></label
    >
    <label v-for="[key, value] in fields" :key="key"
      >{{ t(`devices.scopeField.${key}`) }}
      <select
        v-if="choices(key).length"
        class="ui-input"
        :value="value"
        @change="update(key, ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="choice in choices(key)" :key="choice" :value="choice">
          {{ t(`devices.scopeValue.${choice}`) }}
        </option>
      </select>
      <input
        v-else-if="Array.isArray(value)"
        class="ui-input"
        :value="value.join(', ')"
        @input="
          update(
            key,
            ($event.target as HTMLInputElement).value
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean),
          )
        "
      />
      <input
        v-else
        class="ui-input"
        :type="key === 'uid' ? 'number' : 'text'"
        :required="value !== null"
        :min="key === 'uid' ? 1 : undefined"
        :value="value ?? ''"
        @input="
          update(
            key,
            key === 'uid'
              ? Number(($event.target as HTMLInputElement).value)
              : ($event.target as HTMLInputElement).value,
          )
        "
      />
    </label>
    <template v-if="'owner' in model">
      <label v-if="model.kind !== 'native_user'"
        ><input
          type="checkbox"
          :checked="!!model.owner"
          @change="
            ($event.target as HTMLInputElement).checked
              ? ownerPlatform('platform' in model ? model.platform : 'windows')
              : update('owner', null)
          "
        />{{ t('devices.scopeOwner') }}</label
      >
      <template v-if="model.owner">
        <label
          >{{ t('devices.scopeField.platform')
          }}<select
            class="ui-input"
            :value="model.owner.kind"
            :disabled="'platform' in model"
            @change="
              ownerPlatform(($event.target as HTMLSelectElement).value as 'windows' | 'macos')
            "
          >
            <option value="windows">Windows</option>
            <option value="macos">macOS</option>
          </select></label
        >
        <label v-if="model.owner.kind === 'windows'"
          >SID<input
            class="ui-input"
            required
            :value="model.owner.sid"
            @input="ownerField('sid', $event)"
        /></label>
        <template v-else
          ><label
            >UID<input
              class="ui-input"
              type="number"
              min="1"
              required
              :value="model.owner.uid"
              @input="ownerField('uid', $event)" /></label
          ><label
            >GeneratedUID<input
              class="ui-input"
              required
              :value="model.owner.generated_uid"
              @input="ownerField('generated_uid', $event)" /></label
        ></template>
      </template>
    </template>
  </div>
</template>
