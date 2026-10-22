<script setup lang="ts">
import { UiButton, UiDialog } from '@rss/core/components'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, toRaw, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { isRssApiError } from '@rss/api/mdm'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import PageFrame from '../../../components/PageFrame.vue'
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
  op = useOperation(),
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
function clearImportOnClose(event: Event) {
  if ((event.target as HTMLDetailsElement).open) return
  for (const file of files.value) file.password = ''
  files.value = []
  if (fileInput.value) fileInput.value.value = ''
}
const vault = ref<Vault>(),
  items = ref<Entry[]>([]),
  nextAfter = ref<string | null>(null),
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
  fileInput = ref<HTMLInputElement>(),
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
  if (fileInput.value) fileInput.value.value = ''
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
    () => Promise.all([client.state(), client.list(after), client.settings()]),
    ([v, page, settings]) => {
      setVault(v)
      items.value = after ? [...items.value, ...page.items] : page.items
      nextAfter.value = page.nextAfter
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
function selectFiles(event: Event) {
  files.value = Array.from((event.target as HTMLInputElement).files ?? []).map((file) => ({
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
  if (fileInput.value) fileInput.value.value = ''
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
      history.value = versions
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
  if (!selected.value || !last) return
  await op.run(
    () => client.history(last.entryId, last.version),
    (v) => {
      history.value.push(...v)
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
  <PageFrame :title="t('security.certificate-archive')" :busy="busy" :failure="failure">
    <p>{{ t('security.archive.hint') }}</p>
    <p v-if="diagnosis" role="alert">{{ t(`security.archive.errors.${diagnosis}`) }}</p>
    <p v-if="uncertain" role="status">
      {{ t('security.archive.unknown') }} <code>{{ pending }}</code
      ><UiButton type="button" :disabled="!!busy" @click="recover">
        {{ t('security.archive.recover') }}
      </UiButton>
    </p>
    <section v-if="vault" :aria-label="t('security.archive.vault')">
      <p>
        {{ t(unlocked ? 'security.archive.unlocked' : 'security.archive.locked') }}
        <span v-if="vault.unlockedUntil">{{ date(vault.unlockedUntil) }}</span>
      </p>
      <form v-if="!unlocked" @submit.prevent="authenticate">
        <label for="archive-password">{{ t('security.archive.password') }}</label
        ><input
          id="archive-password"
          v-model="password"
          class="ui-input"
          type="password"
          autocomplete="off"
          minlength="12"
          required
        />
        <UiButton type="submit" :disabled="!!(busy || uncertain)">
          {{ t(vault.initialized ? 'security.archive.unlock' : 'security.archive.initialize') }}
        </UiButton>
      </form>
      <UiButton v-if="unlocked" type="button" :disabled="!!busy" @click="lock">
        {{ t('security.archive.lock') }}
      </UiButton>
      <details v-if="vault.initialized">
        <summary>{{ t('security.archive.changePassword') }}</summary>
        <form @submit.prevent="changePassword">
          <label for="archive-old">{{ t('security.archive.oldPassword') }}</label
          ><input
            id="archive-old"
            v-model="oldPassword"
            class="ui-input"
            type="password"
            autocomplete="off"
            minlength="12"
            required
          />
          <label for="archive-new">{{ t('security.archive.newPassword') }}</label
          ><input
            id="archive-new"
            v-model="newPassword"
            class="ui-input"
            type="password"
            autocomplete="off"
            minlength="12"
            required
          />
          <UiButton type="submit" :disabled="!!(busy || uncertain)">
            {{ t('security.archive.changePassword') }}
          </UiButton>
        </form>
      </details>
    </section>
    <UiButton type="button" :disabled="!!busy" @click="load()">
      {{ t('security.archive.refresh') }}
    </UiButton>
    <p v-if="listingLoaded" role="status">
      {{
        t('security.archive.alerts', {
          expired: alertCounts.expired,
          expiring: alertCounts.expiring,
          notYetValid: alertCounts.notYetValid,
        })
      }}
    </p>
    <p>{{ t('console.loadedFilter') }}</p>
    <label for="archive-filter">{{ t('security.archive.status') }}</label
    ><select id="archive-filter" v-model="filter" class="ui-input">
      <option value="all">{{ t('security.archive.all') }}</option>
      <option
        v-for="value in [
          'expired',
          'expiring',
          'not_yet_valid',
          'valid',
          'request',
          'key',
          'unparsed',
        ]"
        :key="value"
        :value="value"
      >
        {{ t(`security.archive.states.${value}`) }}
      </option>
    </select>
    <p v-if="!listingLoaded">{{ t('console.reading') }}</p>
    <p v-else-if="!displayed.length">{{ t('security.archive.empty') }}</p>
    <div v-else class="ui-table-scroll">
      <table class="ui-table">
        <thead>
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
              <UiButton type="button" :disabled="!!busy" @click="open(entry)">
                {{ entry.latest.metadata.name }}</UiButton
              ><span v-if="entry.retired"> · {{ t('security.archive.retired') }}</span>
            </td>
            <td>{{ entry.latest.metadata.category }}</td>
            <td>
              {{ t(`security.archive.states.${validity(entry.latest.facts, asOf, reminderDays)}`) }}
            </td>
            <td>{{ entry.latest.version }}</td>
            <td>{{ entry.latest.metadata.owner }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <UiButton v-if="nextAfter" type="button" :disabled="!!busy" @click="load(nextAfter)">
      {{ t('security.archive.more') }}
    </UiButton>
    <section v-if="selected" class="console-panel" :aria-label="t('security.archive.history')">
      <h2>{{ selected.latest.metadata.name }} · {{ t('security.archive.history') }}</h2>
      <UiButton
        type="button"
        :disabled="!!(busy || uncertain)"
        @click="
          confirmation = {
            kind: 'manage',
            entry: selected.id,
            revision: selected.revision,
            retired: !selected.retired,
            recommended: selected.recommendedVersion,
          }
        "
      >
        {{ t(selected.retired ? 'security.archive.restore' : 'security.archive.retire') }}
      </UiButton>
      <label for="archive-comparison">{{ t('security.archive.compare') }}</label
      ><select id="archive-comparison" v-model="comparison" class="ui-input">
        <option :value="undefined">{{ t('security.archive.none') }}</option>
        <option v-for="version in history" :key="version.version" :value="version.version">
          {{ version.version }}
        </option>
      </select>
      <div v-if="compareVersion">
        <h3>{{ t('security.archive.compare') }} · {{ compareVersion.version }}</h3>
        <p>
          {{ compareVersion.metadata.name }} · {{ compareVersion.metadata.category }} ·
          {{ compareVersion.metadata.owner }}
        </p>
        <p>
          {{ compareVersion.metadata.usages.join(', ') }} ·
          {{ compareVersion.metadata.labels.join(', ') }}
        </p>
        <p>{{ compareVersion.metadata.notes }}</p>
        <ul>
          <li
            v-for="cert in compareVersion.facts.flatMap((f) => f.certificates)"
            :key="cert.fingerprint"
          >
            {{ cert.subject }} · {{ cert.fingerprint }} · {{ date(cert.notAfter) }}
          </li>
        </ul>
      </div>
      <article v-for="version in history" :key="version.version" class="console-panel">
        <h3>
          {{ t('security.archive.version') }} {{ version.version }} · {{ date(version.createdAt) }}
        </h3>
        <p>{{ version.actor }} · {{ version.source }} · {{ version.operationId }}</p>
        <p>
          {{ version.metadata.name }} · {{ version.metadata.category }} ·
          {{ version.metadata.owner }}
        </p>
        <p>{{ version.metadata.labels.join(', ') }} · {{ version.metadata.usages.join(', ') }}</p>
        <p>{{ version.metadata.notes }}</p>
        <section v-for="file in version.facts" :key="file.name">
          <h4>{{ file.name }} · {{ t(`security.archive.formats.${file.format}`) }}</h4>
          <p v-if="file.containsPrivateKey">{{ t('security.archive.privateKeyPresent') }}</p>
          <p v-if="file.publicKeys.length">{{ file.publicKeys.join(', ') }}</p>
          <dl v-for="cert in file.certificates" :key="cert.fingerprint">
            <dt>{{ t('security.archive.subject') }}</dt>
            <dd>{{ cert.subject }}</dd>
            <dt>{{ t('security.archive.issuer') }}</dt>
            <dd>{{ cert.issuer }}</dd>
            <dt>SAN</dt>
            <dd>{{ cert.sans.join(', ') }}</dd>
            <dt>{{ t('security.archive.serial') }}</dt>
            <dd>{{ cert.serial }}</dd>
            <dt>{{ t('security.archive.fingerprint') }}</dt>
            <dd>{{ cert.fingerprint }}</dd>
            <dt>{{ t('security.archive.algorithm') }}</dt>
            <dd>{{ cert.algorithm }}</dd>
            <dt>{{ t('security.archive.validity') }}</dt>
            <dd>{{ date(cert.notBefore) }} — {{ date(cert.notAfter) }}</dd>
          </dl>
        </section>
        <UiButton
          type="button"
          :disabled="!!(busy || uncertain || !unlocked)"
          @click="confirmation = { kind: 'export', version }"
        >
          {{ t('security.archive.export') }}</UiButton
        ><UiButton
          type="button"
          :disabled="!!(busy || uncertain)"
          @click="
            confirmation = {
              kind: 'manage',
              entry: selected.id,
              revision: selected.revision,
              retired: selected.retired,
              recommended: version.version,
            }
          "
        >
          {{ t('security.archive.recommend') }}
        </UiButton>
      </article>
      <UiButton
        v-if="history.length && history.length % 50 === 0"
        type="button"
        :disabled="!!busy"
        @click="moreHistory"
      >
        {{ t('security.archive.more') }}
      </UiButton>
    </section>
    <section v-if="downloads.length" :aria-label="t('security.archive.downloads')">
      <p>{{ t('security.archive.downloadHint') }}</p>
      <ul>
        <li v-for="file in downloads" :key="file.name">
          <a :href="file.url" :download="file.name">{{ file.name }}</a>
        </li>
      </ul>
      <UiButton type="button" @click="clearDownloads">{{ t('security.archive.clear') }}</UiButton>
    </section>
    <details class="console-panel console-task" @toggle="clearImportOnClose">
      <summary>{{ t('security.archive.add') }}</summary>
      <form @submit.prevent="submit">
        <label for="archive-target">{{ t('security.archive.target') }}</label
        ><select id="archive-target" v-model="target" class="ui-input">
          <option value="">{{ t('security.archive.newEntry') }}</option>
          <option v-if="target && !items.some((e) => e.id === target)" :value="target" disabled>
            {{ target }} · {{ t('devices.notFound') }}
          </option>
          <option v-for="entry in items" :key="entry.id" :value="entry.id">
            {{ entry.latest.metadata.name }}
          </option>
        </select>
        <label for="archive-name">{{ t('security.archive.name') }}</label
        ><input id="archive-name" v-model="meta.name" class="ui-input" required maxlength="256" />
        <label for="archive-category">{{ t('security.archive.category') }}</label
        ><input
          id="archive-category"
          v-model="meta.category"
          class="ui-input"
          list="archive-categories"
          required
          maxlength="128"
        /><datalist id="archive-categories">
          <option v-for="category in categories" :key="category" :value="category" />
        </datalist>
        <label for="archive-labels">{{ t('security.archive.labels') }}</label
        ><input id="archive-labels" v-model="meta.labels" class="ui-input" />
        <label for="archive-usages">{{ t('security.archive.usages') }}</label
        ><textarea id="archive-usages" v-model="meta.usages" class="ui-input" />
        <label for="archive-owner">{{ t('security.archive.owner') }}</label
        ><input id="archive-owner" v-model="meta.owner" class="ui-input" maxlength="256" />
        <label for="archive-notes">{{ t('security.archive.notes') }}</label
        ><textarea id="archive-notes" v-model="meta.notes" class="ui-input" maxlength="4096" />
        <label for="archive-mode">{{ t('security.archive.mode') }}</label
        ><select id="archive-mode" v-model="mode" class="ui-input">
          <option value="import">{{ t('security.archive.import') }}</option>
          <option value="generate">{{ t('security.archive.generate') }}</option>
          <option v-if="target" value="metadata">{{ t('security.archive.editMetadata') }}</option>
        </select>
        <template v-if="mode === 'import'"
          ><label for="archive-file">{{ t('security.archive.files') }}</label
          ><input
            id="archive-file"
            ref="fileInput"
            class="ui-input"
            type="file"
            multiple
            @change="selectFiles"
          />
          <p>{{ t('security.archive.importHint') }}</p>
          <label for="archive-format">{{ t('security.archive.format') }}</label
          ><select id="archive-format" v-model="format" class="ui-input">
            <option v-for="value in formats" :key="value" :value="value">
              {{ t(`security.archive.formats.${value}`) }}
            </option>
          </select>
          <section v-for="(row, index) in files" :key="index">
            <h3>{{ row.file.name }}</h3>
            <label :for="`archive-file-format-${index}`">{{ t('security.archive.format') }}</label>
            <select :id="`archive-file-format-${index}`" v-model="row.format" class="ui-input">
              <option v-for="value in formats" :key="value" :value="value">
                {{ t(`security.archive.formats.${value}`) }}
              </option>
            </select>
            <label :for="`archive-file-password-${index}`">{{
              t('security.archive.filePassword')
            }}</label>
            <input
              :id="`archive-file-password-${index}`"
              v-model="row.password"
              class="ui-input"
              type="password"
              autocomplete="off"
            />
          </section>
          <label for="archive-request-reference">{{ t('security.archive.requestReference') }}</label
          ><select id="archive-request-reference" v-model="requestReference" class="ui-input">
            <option value="">{{ t('security.archive.none') }}</option>
            <option
              v-for="choice in referenceVersions.filter((c) =>
                c.version.facts.some((f) => f.format === 'csr'),
              )"
              :key="choice.value"
              :value="choice.value"
            >
              {{ choice.version.metadata.name }} · {{ choice.version.version }}
            </option>
          </select></template
        >
        <template v-else-if="mode === 'generate'"
          ><label for="archive-profile">{{ t('security.archive.profile') }}</label
          ><select id="archive-profile" v-model="profile" class="ui-input">
            <option v-for="value in profiles" :key="value" :value="value">
              {{ t(`security.archive.profiles.${value}`) }}
            </option>
          </select>
          <p>{{ t('security.archive.externalHint') }}</p>
          <label for="archive-algorithm">{{ t('security.archive.algorithm') }}</label
          ><select id="archive-algorithm" v-model="algorithm" class="ui-input">
            <option value="rsa2048">RSA 2048</option>
            <option value="rsa3072">RSA 3072</option>
            <option value="p256">P-256</option></select
          ><label for="archive-common-name">{{ t('security.archive.commonName') }}</label
          ><input
            id="archive-common-name"
            v-model="commonName"
            class="ui-input"
            required
            maxlength="256" /><label for="archive-organization">{{
            t('security.archive.organization')
          }}</label
          ><input
            id="archive-organization"
            v-model="organization"
            class="ui-input"
            maxlength="256" /><label for="archive-sans">{{ t('security.archive.sans') }}</label
          ><textarea id="archive-sans" v-model="sans" class="ui-input" /><label
            for="archive-days"
            >{{ t('security.archive.days') }}</label
          ><input
            id="archive-days"
            v-model.number="days"
            class="ui-input"
            type="number"
            min="0"
            max="36500" /><label v-if="profile === 'https'" for="archive-issuer">{{
            t('security.archive.issuerReference')
          }}</label
          ><select
            v-if="profile === 'https'"
            id="archive-issuer"
            v-model="issuerReference"
            class="ui-input"
            required
          >
            <option value="">{{ t('security.archive.none') }}</option>
            <option
              v-for="choice in referenceVersions.filter(
                (c) =>
                  c.version.facts.some((f) => f.certificates.length && f.containsPrivateKey) ||
                  (c.version.facts.some((f) => f.certificates.length) &&
                    c.version.facts.some((f) => f.containsPrivateKey)),
              )"
              :key="choice.value"
              :value="choice.value"
            >
              {{ choice.version.metadata.name }} · {{ choice.version.version }}
            </option></select
          ><label v-if="profile === 'scep_template'" for="archive-scep">{{
            t('security.archive.scepUrl')
          }}</label
          ><input
            v-if="profile === 'scep_template'"
            id="archive-scep"
            v-model="scepUrl"
            class="ui-input"
            type="url"
            required
        /></template>
        <UiButton type="submit" :disabled="!!(busy || uncertain || !unlocked)">
          {{ t('security.archive.save') }}
        </UiButton>
      </form>
    </details>
    <details class="console-panel console-task">
      <summary>{{ t('security.archive.settings') }}</summary>
      <form @submit.prevent="saveSettings">
        <label for="archive-reminder">{{ t('security.archive.reminderDays') }}</label
        ><input
          id="archive-reminder"
          v-model.number="reminderDays"
          class="ui-input"
          type="number"
          min="0"
          max="3650"
          required
        /><label for="archive-category-settings">{{ t('security.archive.categories') }}</label
        ><textarea
          id="archive-category-settings"
          v-model="categoryText"
          class="ui-input"
        /><UiButton type="submit" :disabled="!!(busy || uncertain)">
          {{ t('security.archive.save') }}
        </UiButton>
      </form>
    </details>
    <UiDialog
      :open="!!confirmation"
      :title="t('console.review')"
      :close-label="t('console.close')"
      kind="alertdialog"
      @update:open="!$event && (confirmation = undefined)"
    >
      <p>{{ selected?.latest.metadata.name }} · {{ selected?.id }}</p>
      <template v-if="confirmation?.kind === 'export'"
        ><p>{{ t('security.archive.export') }} · {{ confirmation.version.version }}</p>
        <p v-if="confirmation.version.facts.some((file) => file.containsPrivateKey)">
          {{ t('security.archive.privateKeyPresent') }}
        </p></template
      >
      <p v-else-if="confirmation">
        {{ t(confirmation.retired ? 'security.archive.retire' : 'security.archive.restore') }} ·
        {{ t('security.archive.recommend') }} {{ confirmation.recommended ?? '—' }}
      </p>
      <template #footer
        ><UiButton :disabled="busy || uncertain" @click="confirmArchive">{{
          t('identity.confirm')
        }}</UiButton></template
      >
    </UiDialog>
  </PageFrame>
</template>
