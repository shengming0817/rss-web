<script setup lang="ts">
import { ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
import { useMdm } from '../../../context'
import { useOriginalOperation } from '../../../services/useOriginalOperation'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsFacts, useSettingsSecrets } from '../useSettingsAction'
import PermissionChoices from '../../operations/components/PermissionChoices.vue'
import { keyMetadata, keyPermissions, type KeyIntent, type KeyMetadata } from '../clients/apiAccess'
const runtime = useMdm(),
  client = runtime.settings.apiAccess,
  { t } = useI18n(),
  { canRead, canWrite } = usePermission('authorization_read', 'authorization_write')
const { run, submit, locked, pending, busy, failure, resolvedConflict } = useOriginalOperation(
  () => 'api-access',
)
const rows = ref<Awaited<ReturnType<typeof client.keys>>>(),
  current = ref<Awaited<ReturnType<typeof client.key>>>(),
  id = ref(crypto.randomUUID() as string),
  name = ref(''),
  enabled = ref(false),
  expires = ref(''),
  grants = ref<KeyMetadata['grants']>([]),
  secret = ref(''),
  confirmation = ref(false),
  network = ref<Awaited<ReturnType<typeof client.network>>>(),
  networks = ref('')
let secretEpoch = 0
function clearSecret() {
  secretEpoch++
  secret.value = ''
}
function clear() {
  clearSecret()
  rows.value = undefined
  current.value = undefined
  network.value = undefined
  grants.value = []
  networks.value = ''
  name.value = ''
  expires.value = ''
}
useSettingsSecrets(clearSecret)
useSettingsFacts(clear)
async function read() {
  clearSecret()
  current.value = undefined
  const ok = await run(
    () => client.key(id.value),
    (k) => {
      current.value = k
      name.value = k.metadata.name
      enabled.value = k.metadata.enabled
      expires.value = k.metadata.expiresAt?.toString() ?? ''
      grants.value = structuredClone(k.metadata.grants)
    },
  )
  if (failure.value) clear()
  return ok
}
async function load(after?: string) {
  clearSecret()
  rows.value = undefined
  await run(
    () => client.keys(after),
    (v) => {
      rows.value = v
    },
  )
  if (failure.value) clear()
}
function fresh() {
  if (locked.value) return
  clearSecret()
  current.value = undefined
  id.value = crypto.randomUUID()
  name.value = ''
  enabled.value = false
  expires.value = ''
  grants.value = []
}
async function change(kind: KeyIntent['kind'], replay = false) {
  if (!confirmation.value) return
  confirmation.value = false
  clearSecret()
  const epoch = secretEpoch
  try {
    const input: KeyIntent = replay
      ? (pending.value!.input as KeyIntent)
      : kind === 'create' || kind === 'update'
        ? {
            kind,
            id: id.value,
            revision: current.value?.revision ?? 0,
            metadata: keyMetadata({
              name: name.value,
              enabled: enabled.value,
              expiresAt: expires.value ? Number(expires.value) : null,
              grants: toRaw(grants.value),
            }),
          }
        : { kind, id: id.value, revision: current.value?.revision ?? 0 }
    await submit(
      input,
      (operation, original) => client.change(operation, original),
      (v) => {
        if (epoch === secretEpoch && document.visibilityState === 'visible')
          secret.value = v.secret ?? ''
        current.value = undefined
      },
      replay,
    )
  } catch {
    failure.value = 'invalidRequest'
  }
}
async function readNetwork() {
  network.value = undefined
  const ok = await run(
    () => client.network(),
    (v) => {
      network.value = v
      networks.value = v.networks.join('\n')
    },
  )
  if (failure.value) {
    network.value = undefined
    networks.value = ''
  }
  return ok
}
async function saveNetwork(replay = false) {
  if (!confirmation.value || (!network.value && !replay)) return
  confirmation.value = false
  await submit(
    {
      kind: 'network' as const,
      revision: network.value?.revision ?? 0,
      networks: networks.value
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
    },
    (operation, original) => client.changeNetwork(operation, original.revision, original.networks),
    (v) => {
      network.value = v
      networks.value = v.networks.join('\n')
    },
    replay,
  )
}
function restore() {
  const input = pending.value?.input as { kind: KeyIntent['kind'] | 'network' } | undefined
  if (input?.kind === 'network') void saveNetwork(true)
  else if (input) void change(input.kind, true)
}
async function compare() {
  const original = pending.value?.input as KeyIntent | { kind: 'network' } | undefined
  if (!original || pending.value?.state !== 'conflict') return
  let ok
  if (original.kind === 'network') ok = await readNetwork()
  else {
    id.value = original.id
    ok = await read()
  }
  if (ok) resolvedConflict()
}
</script>
<template>
  <section class="console-panel" data-panel="api-access" :aria-busy="busy">
    <h2>{{ t(runtime.realm === 'platform' ? 'gap.networks' : 'gap.apiKeys') }}</h2>
    <p>{{ t(runtime.realm === 'platform' ? 'gap.networkHint' : 'gap.keyHint') }}</p>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <template v-if="runtime.realm === 'tenant'">
      <UiButton :disabled="busy || !canRead" @click="load()">{{ t('gap.load') }}</UiButton
      ><UiButton :disabled="locked || !canWrite" @click="fresh">{{ t('gap.newDraft') }}</UiButton>
      <ul>
        <li v-for="key in rows?.items" :key="key.id">
          <UiButton
            :disabled="locked"
            @click="
              () => {
                id = key.id
                read()
              }
            "
            >{{ key.metadata.name }} · {{ key.id }} · {{ key.revoked }}</UiButton
          >
        </li>
      </ul>
      <UiButton v-if="rows?.nextCursor" :disabled="busy" @click="load(rows.nextCursor)">{{
        t('gap.next')
      }}</UiButton>
      <label
        >{{ t('gap.apiKeys')
        }}<input v-model="id" :disabled="locked" :readonly="!!current" /></label
      ><UiButton :disabled="busy || !canRead" @click="read">{{ t('gap.load') }}</UiButton>
      <form @submit.prevent="change(current ? 'update' : 'create')">
        <fieldset :disabled="locked || !canWrite || current?.revoked">
          <label>{{ t('gap.name') }}<input v-model="name" required /></label
          ><label><input v-model="enabled" type="checkbox" />{{ t('gap.enabled') }}</label
          ><label>{{ t('gap.expires') }}<input v-model="expires" type="number" min="1" /></label>
          <PermissionChoices v-model="grants" realm="tenant" :operations="keyPermissions" />
          <label><input v-model="confirmation" type="checkbox" />{{ t('gap.confirmation') }}</label
          ><UiButton type="submit" :disabled="!confirmation">{{ t('gap.save') }}</UiButton
          ><UiButton
            v-if="current"
            type="button"
            :disabled="!confirmation"
            @click="change('rotate')"
            >{{ t('gap.rotate') }}</UiButton
          ><UiButton
            v-if="current"
            type="button"
            :disabled="!confirmation"
            @click="change('revoke')"
            >{{ t('gap.revoke') }}</UiButton
          >
        </fieldset>
      </form>
      <p>{{ t('gap.firstSecret') }}</p>
      <template v-if="secret"
        ><output>{{ secret }}</output
        ><UiButton @click="clearSecret">{{ t('gap.clear') }}</UiButton></template
      >
    </template>
    <template v-else
      ><UiButton :disabled="busy || !canRead" @click="readNetwork">{{ t('gap.load') }}</UiButton>
      <form @submit.prevent="saveNetwork()">
        <fieldset :disabled="locked || !canWrite || !network">
          <label>{{ t('gap.networks') }}<textarea v-model="networks" /></label
          ><label><input v-model="confirmation" type="checkbox" />{{ t('gap.confirmation') }}</label
          ><UiButton type="submit" :disabled="!confirmation">{{ t('gap.save') }}</UiButton>
        </fieldset>
      </form></template
    >
    <template v-if="pending"
      ><p role="alert">
        {{ t(pending.state === 'conflict' ? 'gap.compare' : 'gap.unknown') }} {{ pending.id }}
      </p>
      <label><input v-model="confirmation" type="checkbox" />{{ t('gap.confirmation') }}</label
      ><UiButton
        v-if="pending.state === 'unknown'"
        :disabled="busy || !confirmation"
        @click="restore"
        >{{ t('gap.replayOriginal') }}</UiButton
      ><UiButton v-if="pending.state === 'conflict'" :disabled="busy" @click="compare">{{
        t('gap.compare')
      }}</UiButton></template
    >
  </section>
</template>
