<script setup lang="ts">
import {
  VAlert,
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VChip,
  VCol,
  VDialog,
  VExpansionPanel,
  VExpansionPanels,
  VFileInput,
  VList,
  VListItem,
  VRow,
  VSelect,
  VTable,
  VTextarea,
  VTextField,
} from 'vuetify/components'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, toRaw, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { isRssApiError } from '@rss/api/mdm'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import MdmPage from '../../../ui/MdmPage.vue'
import {
  formats,
  profiles,
  validity,
  type Algorithm,
  type Entry,
  type Format,
  type Metadata,
  type ImportInput,
  type Profile,
  type Reference,
  type Vault,
  type Version,
} from './model'
const runtime = useMdm(),
  client = runtime.security.certificateArchive,
  { t } = useI18n(),
  route = useRoute(),
  op = useOperation([], () => deviceBinding(runtime)),
  { busy, failure, uncertain } = op
const listingLoaded = ref(false)
const confirmation = ref<
  | { kind: 'export'; version: Version }
  | {
      kind: 'manage'
      entry: string
      revision: number
      retired: boolean
      recommended: number | null
    }
>()
function confirmArchive() {
  const action = confirmation.value
  confirmation.value = undefined
  if (!action || busy.value || uncertain.value) return
  if (action.kind === 'export') {
    if (selected.value?.id === action.version.entryId) void exportVersion(action.version)
  } else if (selected.value?.id === action.entry && selected.value.revision === action.revision)
    void manage(action.retired, action.recommended)
}
function clearImport() {
  for (const file of files.value) file.password = ''
  files.value = []
  uploadFiles.value = []
}
const vault = ref<Vault>(),
  items = ref<Entry[]>([]),
  nextCursor = ref<string | null>(null),
  historyCursor = ref<string | null>(null),
  asOf = ref(0),
  reminderDays = ref(30),
  categories = ref<string[]>([]),
  settingsRevision = ref(0),
  categoryText = ref(''),
  history = ref<Version[]>([]),
  selected = ref<Entry>(),
  comparison = ref<number>(),
  pending = ref<string>(),
  diagnosis = ref(''),
  filter = ref('all'),
  uploadFiles = ref<File[]>([]),
  files = ref<{ file: File; format: Format; password: string }[]>([]),
  format = ref<Format>('certificate'),
  password = ref(''),
  oldPassword = ref(''),
  newPassword = ref(''),
  target = ref(''),
  requestReference = ref(''),
  mode = ref<'import' | 'generate' | 'metadata'>('import'),
  profile = ref<Profile>('ca'),
  algorithm = ref<Algorithm>('rsa2048'),
  commonName = ref(''),
  organization = ref(''),
  sans = ref(''),
  days = ref(0),
  issuerReference = ref(''),
  scepUrl = ref(''),
  downloads = ref<{ name: string; url: string }[]>([])
const editorBase = shallowRef<Entry>()
const alertCounts = ref({ expired: 0, expiring: 0, notYetValid: 0 })
const meta = reactive({
  name: '',
  category: 'custom',
  labels: '',
  usages: '',
  owner: '',
  notes: '',
})
let expiry: ReturnType<typeof setTimeout> | undefined
const sessionStamp = computed(() => {
  const s = runtime.session.state.value
  return s.status === 'authenticated'
    ? [s.tenant, s.identity?.principalId, s.session?.id].join('/')
    : ''
})
const unlocked = computed(
  () => vault.value?.unlockedUntil !== null && vault.value?.unlockedUntil !== undefined,
)
const displayed = computed(() =>
  items.value.filter(
    (e) =>
      filter.value === 'all' ||
      validity(e.latest.facts, asOf.value, reminderDays.value) === filter.value,
  ),
)
const referenceVersions = computed(() => {
  const versions = new Map<string, Version>()
  for (const entry of items.value) versions.set(`${entry.id}:${entry.latest.version}`, entry.latest)
  for (const version of history.value)
    versions.set(`${version.entryId}:${version.version}`, version)
  return Array.from(versions, ([value, version]) => ({ value, version }))
})
const compareVersion = computed(() => history.value.find((v) => v.version === comparison.value))
function clearDownloads() {
  for (const file of downloads.value) URL.revokeObjectURL(file.url)
  downloads.value = []
}
function clearSecrets() {
  password.value = ''
  oldPassword.value = ''
  newPassword.value = ''
  for (const row of files.value) row.password = ''
  files.value = []
  uploadFiles.value = []
  clearDownloads()
  if (expiry) clearTimeout(expiry)
  expiry = undefined
}
function setVault(value: Vault) {
  if (value.unlockedUntil === null) clearSecrets()
  clearDownloads()
  if (expiry) clearTimeout(expiry)
  vault.value = value
  if (value.unlockedUntil !== null) {
    expiry = setTimeout(
      () => {
        clearSecrets()
        if (vault.value) vault.value.unlockedUntil = null
      },
      Math.max(0, (value.unlockedUntil - Math.floor(Date.now() / 1000)) * 1000),
    )
  }
}
watch(
  sessionStamp,
  () => {
    clearSecrets()
    listingLoaded.value = false
    confirmation.value = undefined
    vault.value = undefined
    items.value = []
    history.value = []
    nextCursor.value = null
    historyCursor.value = null
    selected.value = undefined
    editorBase.value = undefined
    pending.value = undefined
  },
  { flush: 'sync' },
)
watch(
  () => route.fullPath,
  () => {
    clearSecrets()
    pending.value = undefined
  },
  { flush: 'sync' },
)
onBeforeUnmount(clearSecrets)
async function invoke<T>(request: () => Promise<T>): Promise<T> {
  const stamp = sessionStamp.value
  try {
    const result = await request()
    if (stamp !== sessionStamp.value) throw new Error('Session changed')
    return result
  } catch (e) {
    if (
      isRssApiError(e) &&
      [
        'archive_locked',
        'archive_password_rejected',
        'archive_material_invalid',
        'archive_key_mismatch',
        'archive_integrity_error',
      ].includes(e.code ?? '')
    )
      diagnosis.value = e.code ?? ''
    throw e
  }
}
async function load(after?: string) {
  if (busy.value) return
  diagnosis.value = ''
  await op.run(
    () => Promise.all([client.state(), client.list({ cursor: after }), client.settings()]),
    ([v, page, settings]) => {
      setVault(v)
      items.value = after ? [...items.value, ...page.items] : page.items
      nextCursor.value = page.nextCursor
      asOf.value = page.asOf
      alertCounts.value = page.alerts
      listingLoaded.value = true
      reminderDays.value = settings.value.reminderDays
      categories.value = settings.value.categories
      categoryText.value = categories.value.join('\n')
      settingsRevision.value = settings.revision
      if (selected.value) selected.value = items.value.find((e) => e.id === selected.value?.id)
    },
  )
}
async function write(request: (id: string) => Promise<unknown>) {
  if (busy.value || uncertain.value) return
  const id = crypto.randomUUID()
  pending.value = id
  diagnosis.value = ''
  if (await op.runWrite(() => invoke(() => request(id)))) {
    pending.value = undefined
    await load()
  }
}
async function recover() {
  if (!pending.value || busy.value) return
  const id = pending.value
  if (
    await op.run(
      () => client.operation(id),
      () => {
        uncertain.value = false
        pending.value = undefined
      },
    )
  ) {
    await load()
  }
}
async function authenticate() {
  const secret = password.value
  password.value = ''
  if (!vault.value) return
  if (!vault.value.initialized) {
    await write((id) => client.initialize(id, secret))
  } else {
    await op.run(() => invoke(() => client.unlock(secret)), setVault)
  }
}
async function lock() {
  clearSecrets()
  if (vault.value) vault.value.unlockedUntil = null
  await op.run(() => client.lock())
}
async function changePassword() {
  const old = oldPassword.value,
    newValue = newPassword.value
  clearSecrets()
  if (vault.value) vault.value.unlockedUntil = null
  await write((id) => client.password(id, old, newValue))
}
function split(value: string) {
  return value
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean)
}
function metadata(): Metadata {
  const base =
    (mode.value === 'metadata' && editorBase.value?.id === target.value
      ? editorBase.value
      : items.value.find((entry) => entry.id === target.value)
    )?.latest.metadata ?? {}
  return {
    ...structuredClone(toRaw(base)),
    name: meta.name,
    category: meta.category,
    labels: split(meta.labels),
    usages: split(meta.usages),
    owner: meta.owner,
    notes: meta.notes,
  }
}
function reference(value: string): Reference | null {
  if (!value) return null
  const [entryId, revision] = value.split(':')
  if (!entryId || !revision) throw new Error('Invalid reference')
  return { entryId, version: Number(revision) }
}
function chosen() {
  if (!target.value) return { entryId: crypto.randomUUID(), expectedRevision: 0 }
  const entry = items.value.find((e) => e.id === target.value)
  if (!entry) {
    failure.value = 'notFound'
    return
  }
  return {
    entryId: entry.id,
    expectedRevision:
      mode.value === 'metadata' && editorBase.value?.id === entry.id
        ? editorBase.value.revision
        : entry.revision,
  }
}
function selectFiles(value: File | File[] | null) {
  files.value = (Array.isArray(value) ? value : value ? [value] : []).map((file) => ({
    file,
    format: format.value,
    password: '',
  }))
}
function encoded(bytes: ArrayBuffer) {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary)
}
async function submit() {
  if (!unlocked.value || busy.value || uncertain.value) return
  const entry = chosen()
  if (!entry) return
  const details = metadata()
  if (mode.value === 'metadata') {
    if (!target.value) return
    await write((id) => client.saveMetadata(id, entry.entryId, entry.expectedRevision, details))
    return
  }
  if (mode.value === 'generate') {
    const input = {
      ...entry,
      metadata: details,
      profile: profile.value,
      algorithm: profile.value === 'apns_csr' ? ('rsa2048' as const) : algorithm.value,
      commonName: commonName.value,
      organization: organization.value,
      sans: profile.value === 'apns_csr' ? [] : split(sans.value),
      days: days.value,
      issuer: profile.value === 'https' ? reference(issuerReference.value) : null,
      scepUrl: profile.value === 'scep_template' ? scepUrl.value || null : null,
    }
    await write((id) => client.generate(id, input))
    return
  }
  const selectedFiles = files.value,
    requestVersion = reference(requestReference.value)
  files.value = []
  uploadFiles.value = []
  let payload: ImportInput['files'] = []
  try {
    if (
      !selectedFiles.length ||
      selectedFiles.length > 16 ||
      selectedFiles.reduce((n, f) => n + f.file.size, 0) > 1024 * 1024
    ) {
      failure.value = 'invalidRequest'
      return
    }
    const prepared = await op.run(
      () =>
        invoke(async () =>
          Promise.all(
            selectedFiles.map(async (row) => ({
              name: row.file.name,
              format: row.format,
              data: encoded(await row.file.arrayBuffer()),
              password: row.password || null,
            })),
          ),
        ),
      (value) => {
        payload = value
      },
    )
    if (!prepared) return
    await write((id) =>
      client.import(id, { ...entry, metadata: details, files: payload, requestVersion }),
    )
  } finally {
    for (const row of selectedFiles) row.password = ''
    for (const file of payload) {
      file.data = ''
      file.password = null
    }
  }
}
async function open(entry: Entry) {
  if (busy.value) return
  clearDownloads()
  await op.run(
    () => client.history(entry.id),
    (versions) => {
      selected.value = entry
      editorBase.value = structuredClone(toRaw(entry))
      history.value = versions.items
      historyCursor.value = versions.nextCursor
      comparison.value = undefined
      target.value = entry.id
      Object.assign(meta, {
        ...entry.latest.metadata,
        labels: entry.latest.metadata.labels.join(', '),
        usages: entry.latest.metadata.usages.join('\n'),
      })
    },
  )
}
async function moreHistory() {
  const last = history.value.at(-1)
  if (!selected.value || !last || !historyCursor.value) return
  await op.run(
    () => client.history(last.entryId, { cursor: historyCursor.value! }),
    (v) => {
      history.value.push(...v.items)
      historyCursor.value = v.nextCursor
    },
  )
}
async function exportVersion(version: Version) {
  if (!unlocked.value || busy.value || uncertain.value) return
  clearDownloads()
  const stamp = sessionStamp.value,
    id = crypto.randomUUID()
  pending.value = id
  await op.runWrite(
    () => invoke(() => client.export(id, { entryId: version.entryId, version: version.version })),
    (result) => {
      if (stamp !== sessionStamp.value || !unlocked.value) return
      downloads.value = result.map((file) => ({
        name: file.name,
        url: URL.createObjectURL(
          new Blob([Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0))], {
            type: 'application/octet-stream',
          }),
        ),
      }))
      pending.value = undefined
    },
  )
}
async function manage(retired: boolean, recommendedVersion: number | null) {
  if (!selected.value) return
  const entry = selected.value
  await write((id) => client.manage(id, entry.id, entry.revision, retired, recommendedVersion))
}
async function saveSettings() {
  await write((id) =>
    client.saveSettings(id, settingsRevision.value, {
      reminderDays: reminderDays.value,
      categories: split(categoryText.value),
    }),
  )
}
function date(value: number) {
  return new Date(value * 1000).toISOString()
}
onMounted(() => load())
</script>
<template>
  <MdmPage
    :title="t('security.certificate-archive')"
    :description="t('security.archive.hint')"
    :busy="busy"
    :failure="failure"
  >
    <template #actions
      ><v-btn variant="tonal" :disabled="busy" @click="load()">{{
        t('security.archive.refresh')
      }}</v-btn></template
    >
    <v-alert v-if="diagnosis" type="error" variant="tonal" class="mb-4">{{
      t(`security.archive.errors.${diagnosis}`)
    }}</v-alert>
    <v-alert v-if="uncertain" type="warning" variant="tonal" class="mb-4"
      >{{ t('security.archive.unknown') }} <code>{{ pending }}</code
      ><v-btn variant="text" :disabled="busy" @click="recover">{{
        t('security.archive.recover')
      }}</v-btn></v-alert
    >
    <v-card v-if="vault" :title="t('security.archive.vault')" class="mb-4"
      ><v-card-text>
        <div class="d-flex align-center flex-wrap ga-3 mb-4">
          <v-chip :color="unlocked ? 'success' : 'warning'">{{
            t(unlocked ? 'security.archive.unlocked' : 'security.archive.locked')
          }}</v-chip
          ><span v-if="vault.unlockedUntil">{{ date(vault.unlockedUntil) }}</span
          ><v-btn v-if="unlocked" variant="tonal" :disabled="busy" @click="lock">{{
            t('security.archive.lock')
          }}</v-btn>
        </div>
        <form v-if="!unlocked" @submit.prevent="authenticate">
          <v-text-field
            id="archive-password"
            v-model="password"
            :label="t('security.archive.password')"
            type="password"
            autocomplete="off"
            minlength="12"
            required
            :disabled="busy || uncertain"
          /><v-btn type="submit" :disabled="busy || uncertain">{{
            t(vault.initialized ? 'security.archive.unlock' : 'security.archive.initialize')
          }}</v-btn>
        </form>
        <v-expansion-panels v-if="vault.initialized" class="mt-4"
          ><v-expansion-panel :title="t('security.archive.changePassword')" eager
            ><template #text
              ><form @submit.prevent="changePassword">
                <v-text-field
                  id="archive-old"
                  v-model="oldPassword"
                  :label="t('security.archive.oldPassword')"
                  type="password"
                  autocomplete="off"
                  minlength="12"
                  required
                  :disabled="busy || uncertain"
                /><v-text-field
                  id="archive-new"
                  v-model="newPassword"
                  :label="t('security.archive.newPassword')"
                  type="password"
                  autocomplete="off"
                  minlength="12"
                  required
                  :disabled="busy || uncertain"
                /><v-btn type="submit" :disabled="busy || uncertain">{{
                  t('security.archive.changePassword')
                }}</v-btn>
              </form></template
            ></v-expansion-panel
          ></v-expansion-panels
        >
      </v-card-text></v-card
    >
    <v-alert v-if="listingLoaded" type="info" variant="tonal" class="mb-4">{{
      t('security.archive.alerts', {
        expired: alertCounts.expired,
        expiring: alertCounts.expiring,
        notYetValid: alertCounts.notYetValid,
      })
    }}</v-alert>
    <v-card class="mb-4"
      ><v-card-text
        ><p class="text-body-2 mb-3">{{ t('console.loadedFilter') }}</p>
        <v-select
          id="archive-filter"
          v-model="filter"
          :label="t('security.archive.status')"
          :items="[
            { value: 'all', title: t('security.archive.all') },
            ...['expired', 'expiring', 'not_yet_valid', 'valid', 'request', 'key', 'unparsed'].map(
              (value) => ({ value, title: t(`security.archive.states.${value}`) }),
            ),
          ]"
        /><v-alert v-if="!listingLoaded" type="info" variant="tonal">{{
          t('console.reading')
        }}</v-alert
        ><v-alert v-else-if="!displayed.length" type="info" variant="tonal">{{
          t('security.archive.empty')
        }}</v-alert>
        <v-table v-else :aria-label="t('security.certificate-archive')"
          ><thead>
            <tr>
              <th>{{ t('security.archive.name') }}</th>
              <th>{{ t('security.archive.category') }}</th>
              <th>{{ t('security.archive.status') }}</th>
              <th>{{ t('security.archive.version') }}</th>
              <th>{{ t('security.archive.owner') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in displayed" :key="entry.id">
              <td>
                <v-btn variant="text" :disabled="busy" @click="open(entry)">{{
                  entry.latest.metadata.name
                }}</v-btn
                ><v-chip v-if="entry.retired" size="small">{{
                  t('security.archive.retired')
                }}</v-chip>
              </td>
              <td>{{ entry.latest.metadata.category }}</td>
              <td>
                {{
                  t(`security.archive.states.${validity(entry.latest.facts, asOf, reminderDays)}`)
                }}
              </td>
              <td>{{ entry.latest.version }}</td>
              <td>{{ entry.latest.metadata.owner }}</td>
            </tr>
          </tbody></v-table
        ><v-btn v-if="nextCursor" variant="text" :disabled="busy" @click="load(nextCursor)">{{
          t('security.archive.more')
        }}</v-btn>
      </v-card-text></v-card
    >
    <v-card
      v-if="selected"
      :title="selected.latest.metadata.name + ' · ' + t('security.archive.history')"
      class="mb-4"
      ><v-card-text>
        <v-btn
          variant="tonal"
          :disabled="busy || uncertain"
          class="mb-4"
          @click="
            confirmation = {
              kind: 'manage',
              entry: selected.id,
              revision: selected.revision,
              retired: !selected.retired,
              recommended: selected.recommendedVersion,
            }
          "
          >{{ t(selected.retired ? 'security.archive.restore' : 'security.archive.retire') }}</v-btn
        >
        <v-select
          id="archive-comparison"
          v-model="comparison"
          :label="t('security.archive.compare')"
          clearable
          :items="
            history.map((version) => ({ value: version.version, title: String(version.version) }))
          "
        />
        <v-card
          v-if="compareVersion"
          variant="tonal"
          :title="t('security.archive.compare') + ' · ' + compareVersion.version"
          class="mb-4"
          ><v-card-text
            ><p>
              {{ compareVersion.metadata.name }} · {{ compareVersion.metadata.category }} ·
              {{ compareVersion.metadata.owner }}
            </p>
            <p>
              {{ compareVersion.metadata.usages.join(', ') }} ·
              {{ compareVersion.metadata.labels.join(', ') }}
            </p>
            <p>{{ compareVersion.metadata.notes }}</p>
            <v-list bg-color="transparent"
              ><v-list-item
                v-for="cert in compareVersion.facts.flatMap((f) => f.certificates)"
                :key="cert.fingerprint"
                :title="cert.subject"
                :subtitle="cert.fingerprint + ' · ' + date(cert.notAfter)" /></v-list></v-card-text
        ></v-card>
        <v-expansion-panels multiple
          ><v-expansion-panel
            v-for="version in history"
            :key="version.version"
            :title="
              t('security.archive.version') +
              ' ' +
              version.version +
              ' · ' +
              date(version.createdAt)
            "
            eager
            ><template #text>
              <p>{{ version.actor }} · {{ version.source }} · {{ version.operationId }}</p>
              <p>
                {{ version.metadata.name }} · {{ version.metadata.category }} ·
                {{ version.metadata.owner }}
              </p>
              <p>
                {{ version.metadata.labels.join(', ') }} · {{ version.metadata.usages.join(', ') }}
              </p>
              <p class="mb-4">{{ version.metadata.notes }}</p>
              <section v-for="file in version.facts" :key="file.name" class="mb-4">
                <h3 class="text-subtitle-1">
                  {{ file.name }} · {{ t(`security.archive.formats.${file.format}`) }}
                </h3>
                <v-alert
                  v-if="file.containsPrivateKey"
                  type="warning"
                  variant="tonal"
                  class="my-3"
                  >{{ t('security.archive.privateKeyPresent') }}</v-alert
                >
                <p v-if="file.publicKeys.length">{{ file.publicKeys.join(', ') }}</p>
                <v-table v-for="cert in file.certificates" :key="cert.fingerprint"
                  ><tbody>
                    <tr>
                      <th>{{ t('security.archive.subject') }}</th>
                      <td>{{ cert.subject }}</td>
                    </tr>
                    <tr>
                      <th>{{ t('security.archive.issuer') }}</th>
                      <td>{{ cert.issuer }}</td>
                    </tr>
                    <tr>
                      <th>SAN</th>
                      <td>{{ cert.sans.join(', ') }}</td>
                    </tr>
                    <tr>
                      <th>{{ t('security.archive.serial') }}</th>
                      <td>{{ cert.serial }}</td>
                    </tr>
                    <tr>
                      <th>{{ t('security.archive.fingerprint') }}</th>
                      <td class="text-break">{{ cert.fingerprint }}</td>
                    </tr>
                    <tr>
                      <th>{{ t('security.archive.algorithm') }}</th>
                      <td>{{ cert.algorithm }}</td>
                    </tr>
                    <tr>
                      <th>{{ t('security.archive.validity') }}</th>
                      <td>{{ date(cert.notBefore) }} — {{ date(cert.notAfter) }}</td>
                    </tr>
                  </tbody></v-table
                >
              </section>
              <div class="d-flex flex-wrap ga-3">
                <v-btn
                  :disabled="busy || uncertain || !unlocked"
                  @click="confirmation = { kind: 'export', version }"
                  >{{ t('security.archive.export') }}</v-btn
                ><v-btn
                  variant="tonal"
                  :disabled="busy || uncertain"
                  @click="
                    confirmation = {
                      kind: 'manage',
                      entry: selected.id,
                      revision: selected.revision,
                      retired: selected.retired,
                      recommended: version.version,
                    }
                  "
                  >{{ t('security.archive.recommend') }}</v-btn
                >
              </div>
            </template></v-expansion-panel
          ></v-expansion-panels
        ><v-btn v-if="historyCursor" variant="text" :disabled="busy" @click="moreHistory">{{
          t('security.archive.more')
        }}</v-btn>
      </v-card-text></v-card
    >
    <v-card v-if="downloads.length" :title="t('security.archive.downloads')" class="mb-4"
      ><v-card-text
        ><p>{{ t('security.archive.downloadHint') }}</p>
        <v-list
          ><v-list-item v-for="file in downloads" :key="file.name"
            ><v-btn :href="file.url" :download="file.name" variant="text">{{
              file.name
            }}</v-btn></v-list-item
          ></v-list
        ><v-btn variant="tonal" @click="clearDownloads">{{
          t('security.archive.clear')
        }}</v-btn></v-card-text
      ></v-card
    >
    <v-card :title="t('security.archive.add')" class="mb-4"
      ><v-card-text>
        <form @submit.prevent="submit">
          <v-select
            id="archive-target"
            v-model="target"
            :label="t('security.archive.target')"
            :items="[
              { value: '', title: t('security.archive.newEntry') },
              ...(target && !items.some((e) => e.id === target)
                ? [
                    {
                      value: target,
                      title: target + ' · ' + t('devices.notFound'),
                      props: { disabled: true },
                    },
                  ]
                : []),
              ...items.map((entry) => ({ value: entry.id, title: entry.latest.metadata.name })),
            ]"
            :disabled="busy || uncertain"
          />
          <v-row
            ><v-col cols="12" md="6"
              ><v-text-field
                id="archive-name"
                v-model="meta.name"
                :label="t('security.archive.name')"
                required
                maxlength="256"
                :disabled="busy || uncertain" /></v-col
            ><v-col cols="12" md="6"
              ><v-text-field
                id="archive-category"
                v-model="meta.category"
                :label="t('security.archive.category')"
                :hint="categories.join(', ')"
                required
                maxlength="128"
                :disabled="busy || uncertain" /></v-col
            ><v-col cols="12" md="6"
              ><v-text-field
                id="archive-labels"
                v-model="meta.labels"
                :label="t('security.archive.labels')"
                :disabled="busy || uncertain" /></v-col
            ><v-col cols="12" md="6"
              ><v-text-field
                id="archive-owner"
                v-model="meta.owner"
                :label="t('security.archive.owner')"
                maxlength="256"
                :disabled="busy || uncertain" /></v-col
          ></v-row>
          <v-textarea
            id="archive-usages"
            v-model="meta.usages"
            :label="t('security.archive.usages')"
            rows="2"
            :disabled="busy || uncertain"
          /><v-textarea
            id="archive-notes"
            v-model="meta.notes"
            :label="t('security.archive.notes')"
            maxlength="4096"
            rows="2"
            :disabled="busy || uncertain"
          />
          <v-select
            id="archive-mode"
            v-model="mode"
            :label="t('security.archive.mode')"
            :items="[
              { value: 'import', title: t('security.archive.import') },
              { value: 'generate', title: t('security.archive.generate') },
              ...(target ? [{ value: 'metadata', title: t('security.archive.editMetadata') }] : []),
            ]"
            :disabled="busy || uncertain"
          />
          <template v-if="mode === 'import'">
            <v-select
              id="archive-format"
              v-model="format"
              :label="t('security.archive.format')"
              :items="
                formats.map((value) => ({ value, title: t(`security.archive.formats.${value}`) }))
              "
              :disabled="busy || uncertain"
            /><v-file-input
              id="archive-file"
              v-model="uploadFiles"
              :label="t('security.archive.files')"
              multiple
              :disabled="busy || uncertain"
              @update:model-value="selectFiles"
            />
            <p class="mb-3">{{ t('security.archive.importHint') }}</p>
            <v-card
              v-for="(row, index) in files"
              :key="index"
              :title="row.file.name"
              variant="tonal"
              class="my-3"
              ><v-card-text
                ><v-select
                  :id="`archive-file-format-${index}`"
                  v-model="row.format"
                  :label="t('security.archive.format')"
                  :items="
                    formats.map((value) => ({
                      value,
                      title: t(`security.archive.formats.${value}`),
                    }))
                  "
                  :disabled="busy || uncertain" /><v-text-field
                  :id="`archive-file-password-${index}`"
                  v-model="row.password"
                  :label="t('security.archive.filePassword')"
                  type="password"
                  autocomplete="off"
                  :disabled="busy || uncertain" /></v-card-text
            ></v-card>
            <v-select
              id="archive-request-reference"
              v-model="requestReference"
              :label="t('security.archive.requestReference')"
              :items="[
                { value: '', title: t('security.archive.none') },
                ...referenceVersions
                  .filter((c) => c.version.facts.some((f) => f.format === 'csr'))
                  .map((c) => ({
                    value: c.value,
                    title: c.version.metadata.name + ' · ' + c.version.version,
                  })),
              ]"
              :disabled="busy || uncertain"
            /><v-btn variant="text" :disabled="busy" @click="clearImport">{{
              t('security.archive.clear')
            }}</v-btn>
          </template>
          <template v-else-if="mode === 'generate'">
            <v-alert type="info" variant="tonal" class="mb-4">{{
              t('security.archive.externalHint')
            }}</v-alert
            ><v-select
              id="archive-profile"
              v-model="profile"
              :label="t('security.archive.profile')"
              :items="
                profiles.map((value) => ({ value, title: t(`security.archive.profiles.${value}`) }))
              "
              :disabled="busy || uncertain"
            /><v-select
              id="archive-algorithm"
              v-model="algorithm"
              :label="t('security.archive.algorithm')"
              :items="[
                { value: 'rsa2048', title: 'RSA 2048' },
                { value: 'rsa3072', title: 'RSA 3072' },
                { value: 'p256', title: 'P-256' },
              ]"
              :disabled="busy || uncertain"
            />
            <v-text-field
              id="archive-common-name"
              v-model="commonName"
              :label="t('security.archive.commonName')"
              required
              maxlength="256"
              :disabled="busy || uncertain"
            /><v-text-field
              id="archive-organization"
              v-model="organization"
              :label="t('security.archive.organization')"
              maxlength="256"
              :disabled="busy || uncertain"
            /><v-textarea
              id="archive-sans"
              v-model="sans"
              :label="t('security.archive.sans')"
              rows="2"
              :disabled="busy || uncertain"
            /><v-text-field
              id="archive-days"
              v-model.number="days"
              :label="t('security.archive.days')"
              type="number"
              min="0"
              max="36500"
              :disabled="busy || uncertain"
            />
            <v-select
              v-if="profile === 'https'"
              id="archive-issuer"
              v-model="issuerReference"
              :label="t('security.archive.issuerReference')"
              required
              :items="[
                { value: '', title: t('security.archive.none') },
                ...referenceVersions
                  .filter(
                    (c) =>
                      c.version.facts.some((f) => f.certificates.length && f.containsPrivateKey) ||
                      (c.version.facts.some((f) => f.certificates.length) &&
                        c.version.facts.some((f) => f.containsPrivateKey)),
                  )
                  .map((c) => ({
                    value: c.value,
                    title: c.version.metadata.name + ' · ' + c.version.version,
                  })),
              ]"
              :disabled="busy || uncertain"
            /><v-text-field
              v-if="profile === 'scep_template'"
              id="archive-scep"
              v-model="scepUrl"
              :label="t('security.archive.scepUrl')"
              type="url"
              required
              :disabled="busy || uncertain"
            />
          </template>
          <v-btn type="submit" :disabled="busy || uncertain || !unlocked" class="mt-3">{{
            t('security.archive.save')
          }}</v-btn>
        </form>
      </v-card-text></v-card
    >
    <v-expansion-panels
      ><v-expansion-panel :title="t('security.archive.settings')" eager
        ><template #text
          ><form @submit.prevent="saveSettings">
            <v-text-field
              id="archive-reminder"
              v-model.number="reminderDays"
              :label="t('security.archive.reminderDays')"
              type="number"
              min="0"
              max="3650"
              required
              :disabled="busy || uncertain"
            /><v-textarea
              id="archive-category-settings"
              v-model="categoryText"
              :label="t('security.archive.categories')"
              :disabled="busy || uncertain"
            /><v-btn type="submit" :disabled="busy || uncertain">{{
              t('security.archive.save')
            }}</v-btn>
          </form></template
        ></v-expansion-panel
      ></v-expansion-panels
    >
    <v-dialog
      :model-value="!!confirmation"
      max-width="680"
      :persistent="busy"
      :aria-label="t('console.review')"
      @update:model-value="!$event && (confirmation = undefined)"
      ><v-card
        ><v-card-title>{{ t('console.review') }}</v-card-title
        ><v-card-text
          ><p>{{ selected?.latest.metadata.name }} · {{ selected?.id }}</p>
          <template v-if="confirmation?.kind === 'export'"
            ><p>{{ t('security.archive.export') }} · {{ confirmation.version.version }}</p>
            <v-alert
              v-if="confirmation.version.facts.some((file) => file.containsPrivateKey)"
              type="warning"
              variant="tonal"
              class="my-3"
              >{{ t('security.archive.privateKeyPresent') }}</v-alert
            ></template
          >
          <p v-else-if="confirmation">
            {{ t(confirmation.retired ? 'security.archive.retire' : 'security.archive.restore') }} ·
            {{ t('security.archive.recommend') }} {{ confirmation.recommended ?? '—' }}
          </p></v-card-text
        ><v-card-actions
          ><v-btn :disabled="busy" @click="confirmation = undefined">{{ t('console.close') }}</v-btn
          ><v-btn :disabled="busy || uncertain" @click="confirmArchive">{{
            t('identity.confirm')
          }}</v-btn></v-card-actions
        ></v-card
      ></v-dialog
    >
  </MdmPage>
</template>
