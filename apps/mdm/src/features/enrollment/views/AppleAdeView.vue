<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { usePermission } from '../usePermission'
import { useAttachment } from '../useAttachment'
import { setupPanes, type AdeCommand } from '../clients/apple'
import RegistrationStatus from '../../../components/RegistrationStatus.vue'
import PageFrame from '../../../components/PageFrame.vue'
const id = ref('')
const runtime = useMdm(),
  client = runtime.onboarding.apple,
  { t } = useI18n(),
  { canRead, canWrite } = usePermission(
    'registration_configuration_read',
    'registration_configuration_write',
  ),
  { run, runWrite, busy, uncertain, failure } = useOperation(['service_unavailable'], () => [
    runtime.session.state.value.session?.id,
    id.value,
  ])
const delivery = useAttachment(),
  { url, filename } = delivery
const organizations = ref<Awaited<ReturnType<typeof client.organizations>>['items']>([]),
  status = ref<Awaited<ReturnType<typeof client.ade>>>(),
  profiles = ref<Awaited<ReturnType<typeof client.profiles>>['items']>([]),
  devices = ref<Awaited<ReturnType<typeof client.devices>>['items']>([]),
  cursor = ref<string | null>(null),
  organizationCursor = ref<string | null>(null),
  profileCursor = ref<string | null>(null),
  operationId = ref(''),
  operation = ref<Awaited<ReturnType<typeof client.operation>>>()
const serverUuid = ref(''),
  orgId = ref(''),
  enabled = ref(false),
  rotateKey = ref(false),
  token = ref(''),
  fullSync = ref(false),
  profileId = ref(''),
  profileName = ref(''),
  mandatory = ref(true),
  removable = ref(false),
  skip = ref<(typeof setupPanes)[number][]>([]),
  serials = ref(''),
  recoveryId = ref(''),
  remoteProfile = ref('')
const seenCursors = new Set<string>()
const blocked = computed(
  () =>
    busy.value ||
    uncertain.value ||
    (operation.value && ['pending', 'running', 'unknown'].includes(operation.value.state)),
)
function refresh() {
  if (!canRead.value || !id.value) return
  void run(
    async () => ({
      status: await client.ade(id.value),
      profiles: await client.profiles(id.value),
      devices: await client.devices(id.value),
    }),
    (v) => {
      status.value = v.status
      profiles.value = v.profiles.items
      profileCursor.value = v.profiles.nextCursor
      devices.value = v.devices.items
      cursor.value = v.devices.nextCursor
      seenCursors.clear()
      if (cursor.value) seenCursors.add(cursor.value)
      serverUuid.value = v.status.serverUuid
      orgId.value = v.status.orgId
      enabled.value = v.status.enabled
    },
  )
}
function list(cursor?: string) {
  if (!canRead.value) return
  void run(
    () => client.organizations({ cursor }),
    (v) => {
      organizations.value = cursor ? [...organizations.value, ...v.items] : v.items
      organizationCursor.value = v.nextCursor
    },
  )
}
function next() {
  if (!cursor.value) return
  const after = cursor.value
  void run(
    () => client.devices(id.value, { cursor: after }),
    (v) => {
      if (
        (v.nextCursor && seenCursors.has(v.nextCursor)) ||
        v.items.some((d) => devices.value.some((old) => old.serial === d.serial))
      ) {
        failure.value = 'invalidResponse'
        return
      }
      devices.value.push(...v.items)
      cursor.value = v.nextCursor
      if (cursor.value) seenCursors.add(cursor.value)
    },
  )
}
function moreProfiles() {
  if (!profileCursor.value) return
  void run(
    () => client.profiles(id.value, { cursor: profileCursor.value! }),
    (page) => {
      profiles.value.push(...page.items)
      profileCursor.value = page.nextCursor
    },
  )
}
function readOperation() {
  if (!canRead.value || !id.value || !operationId.value) return
  void run(
    () => client.operation(id.value, operationId.value),
    (v) => {
      operation.value = v
      uncertain.value = false
    },
  )
}
function configure() {
  if (!canWrite.value || blocked.value) return
  operationId.value = crypto.randomUUID()
  operation.value = undefined
  void runWrite(() =>
    client.configure(id.value, operationId.value, {
      expectedRevision: status.value?.revision ?? 0,
      enabled: enabled.value,
      serverUuid: serverUuid.value,
      orgId: orgId.value,
      rotateKey: rotateKey.value,
    }),
  ).then((ok) => {
    if (ok) {
      readOperation()
    }
  })
}
function submit(command: AdeCommand, recovery = false) {
  if (!canWrite.value || busy.value || (!recovery && blocked.value)) return
  operationId.value = crypto.randomUUID()
  operation.value = undefined
  void runWrite(() => client.command(id.value, operationId.value, command)).then((ok) => {
    if (ok) readOperation()
  })
}
function importToken() {
  const p7m = token.value
  token.value = ''
  if (p7m && status.value) submit({ kind: 'token', expectedRevision: status.value.revision, p7m })
}
async function selectToken(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0],
    own = delivery.stamp()
  input.value = ''
  token.value = ''
  if (!file || !file.size || file.size > 180 * 1024) {
    failure.value = 'invalidRequest'
    return
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  try {
    if (own !== delivery.stamp()) return
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    token.value = btoa(binary)
  } finally {
    bytes.fill(0)
  }
}
function chooseProfile(profile: (typeof profiles.value)[number]) {
  profileId.value = profile.id
  profileName.value = profile.configuration.name
  mandatory.value = profile.configuration.mandatory
  removable.value = profile.configuration.removable
  skip.value = [...profile.configuration.skip]
}
function saveProfile() {
  const old = profiles.value.find((p) => p.id === profileId.value)
  submit({
    kind: 'profile',
    id: profileId.value || crypto.randomUUID(),
    expectedRevision: old?.revision ?? 0,
    configuration: {
      name: profileName.value,
      mandatory: mandatory.value,
      removable: removable.value,
      skip: [...skip.value],
    },
  })
}
function assignment(clear: boolean) {
  const selection = serials.value
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean),
    profile = profiles.value.find((p) => p.id === profileId.value)
  if (clear) submit({ kind: 'clear', devices: selection })
  else if (profile)
    submit({ kind: 'assign', profile: profile.id, revision: profile.revision, devices: selection })
}
async function publicKey() {
  delivery.clear()
  const own = delivery.stamp()
  let file: Awaited<ReturnType<typeof client.publicKey>> | undefined
  try {
    await run(
      async () => {
        file = await client.publicKey(id.value)
        return file
      },
      (file) => delivery.deliver(file, 'RSS-ADE-public.pem', own),
    )
  } finally {
    if (file) new Uint8Array(file.bytes).fill(0)
  }
}
watch(id, () => {
  status.value = undefined
  profiles.value = []
  devices.value = []
  cursor.value = null
  profileCursor.value = null
  operation.value = undefined
  operationId.value = ''
  token.value = ''
  delivery.clear()
  if (id.value) refresh()
})
watch(
  canRead,
  (allowed) => {
    organizations.value = []
    token.value = ''
    delivery.clear()
    if (allowed) list()
  },
  { immediate: true },
)
watch(
  [() => canWrite.value, () => runtime.session.state.value.session?.id],
  () => {
    token.value = ''
    delivery.clear()
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  token.value = ''
})
</script>
<template>
  <PageFrame :title="t('onboarding.appleAde')" :busy="busy" :failure="failure">
    <RegistrationStatus channel="macos_mdm" />
    <p>{{ t('onboarding.adeGuide') }}</p>
    <p v-if="!canRead">{{ t('devices.denied') }}</p>
    <template v-else>
      <UiButton v-if="organizationCursor" :disabled="busy" @click="list(organizationCursor)">{{
        t('devices.next')
      }}</UiButton>
      <label
        >{{ t('onboarding.organization')
        }}<select v-model="id" class="ui-input" :disabled="busy || uncertain">
          <option value="">{{ t('devices.select') }}</option>
          <option v-for="o in organizations" :key="o.id" :value="o.id">
            {{ o.accountEnrollment?.domain || o.ade?.orgId || o.id }} · {{ o.id }}
          </option>
        </select></label
      >
      <label v-if="canWrite"
        >{{ t('onboarding.organizationId')
        }}<input v-model="id" class="ui-input" :disabled="busy || uncertain"
      /></label>
      <UiButton type="button" :disabled="!!busy" @click="refresh">{{
        t('devices.reload')
      }}</UiButton>
      <dl v-if="status">
        <dt>{{ t('devices.revision') }}</dt>
        <dd>{{ status.revision }}</dd>
        <dt>{{ t('onboarding.tokenState') }}</dt>
        <dd>{{ t(`onboarding.token_${status.tokenState}`) }}</dd>
        <dt>{{ t('devices.expires') }}</dt>
        <dd>{{ status.tokenExpiresAt ?? t('devices.unknown') }}</dd>
        <dt>{{ t('onboarding.lastSync') }}</dt>
        <dd>{{ status.syncedAt ?? t('devices.unknown') }}</dd>
        <dt>{{ t('onboarding.externalVerification') }}</dt>
        <dd>{{ t('onboarding.notObserved') }}</dd>
      </dl>
      <details
        v-if="canWrite && id"
        class="console-panel console-task"
        :open="uncertain || undefined"
      >
        <summary>{{ t('console.configure') }}</summary>
        <form @submit.prevent="configure">
          <fieldset :disabled="blocked">
            <legend>{{ t('onboarding.organizationConfiguration') }}</legend>
            <label
              >{{ t('onboarding.serverUuid')
              }}<input v-model="serverUuid" class="ui-input" required /></label
            ><label
              >{{ t('onboarding.appleOrganizationId')
              }}<input v-model="orgId" class="ui-input" required maxlength="256" /></label
            ><label><input v-model="enabled" type="checkbox" />{{ t('onboarding.enabled') }}</label
            ><label
              ><input v-model="rotateKey" type="checkbox" />{{ t('onboarding.rotateKey') }}</label
            ><UiButton type="submit">{{ t('registration.save') }}</UiButton>
          </fieldset>
        </form>
      </details>
      <template v-if="status"
        ><UiButton type="button" :disabled="!!busy" @click="publicKey">
          {{ t('onboarding.exportPublicKey') }}</UiButton
        ><a v-if="url" :href="url" :download="filename">{{ t('onboarding.download') }}</a></template
      >
      <details
        v-if="canWrite && status"
        class="console-panel console-task"
        :open="uncertain || undefined"
      >
        <summary>{{ t('onboarding.importToken') }}</summary>
        <form @submit.prevent="importToken">
          <fieldset :disabled="blocked">
            <legend>{{ t('onboarding.importToken') }}</legend>
            <label
              >{{ t('onboarding.p7m')
              }}<input class="ui-input" type="file" accept=".p7m" @change="selectToken" /></label
            ><UiButton :disabled="!!!token" type="submit">{{
              t('onboarding.importToken')
            }}</UiButton>
          </fieldset>
        </form>
      </details>
      <section v-if="canWrite && status" class="console-panel">
        <h2>{{ t('onboarding.sync') }}</h2>
        <form @submit.prevent="submit({ kind: 'sync', full: fullSync })">
          <fieldset :disabled="blocked">
            <label><input v-model="fullSync" type="checkbox" />{{ t('onboarding.fullSync') }}</label
            ><UiButton type="submit">{{ t('onboarding.sync') }}</UiButton>
          </fieldset>
        </form>
      </section>
      <details
        v-if="canWrite && status"
        class="console-panel console-task"
        :open="uncertain || undefined"
      >
        <summary>{{ t('onboarding.setupProfile') }}</summary>
        <form @submit.prevent="saveProfile">
          <fieldset :disabled="blocked">
            <legend>{{ t('onboarding.setupProfile') }}</legend>
            <label
              >{{ t('onboarding.profileId') }}<input v-model="profileId" class="ui-input" /></label
            ><label
              >{{ t('devices.name')
              }}<input v-model="profileName" class="ui-input" required maxlength="128" /></label
            ><label
              ><input v-model="mandatory" type="checkbox" />{{ t('onboarding.mandatory') }}</label
            ><label
              ><input v-model="removable" type="checkbox" />{{ t('onboarding.removable') }}</label
            >
            <fieldset>
              <legend>{{ t('onboarding.skipSetup') }}</legend>
              <label v-for="pane in setupPanes" :key="pane"
                ><input v-model="skip" type="checkbox" :value="pane" />{{ pane }}</label
              >
            </fieldset>
            <UiButton :disabled="!!(!mandatory && !removable)" type="submit">{{
              t('registration.save')
            }}</UiButton>
          </fieldset>
        </form>
      </details>
      <ul>
        <li v-for="p in profiles" :key="p.id">
          <UiButton type="button" :disabled="!!blocked" @click="chooseProfile(p)">
            {{ p.configuration.name }} · {{ p.id }} · {{ p.revision }} ·
            {{ p.remoteUuid ?? t('devices.unknown') }}
          </UiButton>
        </li>
      </ul>
      <div class="ui-table-scroll">
        <table class="ui-table">
          <thead>
            <tr>
              <th>{{ t('onboarding.serial') }}</th>
              <th>{{ t('onboarding.remoteProfile') }}</th>
              <th>{{ t('devices.status') }}</th>
              <th>{{ t('devices.observed') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in devices" :key="d.serial">
              <td>{{ d.serial }}</td>
              <td>{{ d.profileUuid ?? '—' }}</td>
              <td>
                {{ d.deleted ? t('devices.deleted') : t('onboarding.registrationNotImplied') }}
              </td>
              <td>{{ d.observedAt }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <UiButton v-if="profileCursor" :disabled="busy" @click="moreProfiles">{{
        t('devices.next')
      }}</UiButton>
      <UiButton v-if="cursor" type="button" :disabled="!!busy" @click="next">
        {{ t('devices.next') }}
      </UiButton>
      <details
        v-if="canWrite && status"
        class="console-panel console-task"
        :open="uncertain || undefined"
      >
        <summary>{{ t('console.targets') }}</summary>
        <form @submit.prevent="assignment(false)">
          <fieldset :disabled="blocked">
            <label
              >{{ t('onboarding.serials')
              }}<textarea v-model="serials" class="ui-input" required /></label
            ><UiButton type="submit">{{ t('onboarding.assignProfile') }}</UiButton
            ><UiButton type="button" @click="assignment(true)">
              {{ t('onboarding.clearAssignment') }}
            </UiButton>
          </fieldset>
        </form>
      </details>
      <section class="console-panel">
        <h2>{{ t('console.enrollmentProgress') }}</h2>
        <form @submit.prevent="readOperation">
          <label
            >{{ t('devices.operation')
            }}<input
              v-model="operationId"
              class="ui-input"
              required
              :disabled="busy || uncertain" /></label
          ><UiButton :disabled="!!busy" type="submit">{{ t('onboarding.readOutcome') }}</UiButton>
        </form>
      </section>
      <p v-if="operation">{{ operation.kind }} · {{ t(`onboarding.ade_${operation.state}`) }}</p>
      <pre v-if="operation?.result">{{ JSON.stringify(operation.result, null, 2) }}</pre>
      <p>{{ t('onboarding.registrationNotImplied') }}</p>
      <form
        v-if="canWrite && operation?.state === 'unknown'"
        @submit.prevent="
          submit({ kind: 'reconcile', operation: recoveryId || operation!.operationId }, true)
        "
      >
        <fieldset :disabled="busy">
          <label
            >{{ t('onboarding.originalOperation')
            }}<input v-model="recoveryId" class="ui-input" /></label
          ><UiButton v-if="['assign', 'clear'].includes(operation.kind)" type="submit">
            {{ t('onboarding.reconcile') }}</UiButton
          ><label v-if="operation.kind === 'profile'"
            >{{ t('onboarding.remoteProfile')
            }}<input v-model="remoteProfile" class="ui-input" required /></label
          ><UiButton
            v-if="operation.kind === 'profile'"
            type="button"
            @click="
              submit(
                { kind: 'resolve', operation: recoveryId || operation!.operationId, remoteProfile },
                true,
              )
            "
          >
            {{ t('onboarding.resolve') }}
          </UiButton>
        </fieldset>
      </form>
    </template>
  </PageFrame>
</template>
