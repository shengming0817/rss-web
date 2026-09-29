<script setup lang="ts">
import { ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useMdm } from '../../../context'
import { operation, useOperation, type Operation } from '../../../services/useOperation'
import {
  catalogDefinition,
  type CatalogChange,
  type CatalogDefinition,
  type CatalogEntry,
} from '../clients/catalog'
import SoftwareFrame from '../components/SoftwareFrame.vue'
import VersionAdmission from '../components/VersionAdmission.vue'
const { t } = useI18n(),
  route = useRoute(),
  runtime = useMdm(),
  client = runtime.software.catalog
const { run, runWrite, busy, uncertain, failure } = useOperation()
const query = ref(''),
  search = ref(''),
  id = ref(''),
  page = ref<Awaited<ReturnType<typeof client.list>>>(),
  current = ref<CatalogEntry>()
const draft = ref<CatalogDefinition>(),
  supersedes = ref('[]'),
  selectedVersion = ref('')
let pending: { id: string; body: Operation<CatalogChange> } | undefined
function apply(value: CatalogEntry) {
  current.value = value
  id.value = value.resource.id
  draft.value = structuredClone(value.metadata.definition)
  supersedes.value = JSON.stringify(value.metadata.definition.supersedes, null, 2)
  selectedVersion.value = value.resource.versions[0]?.id ?? ''
}
function list(cursor?: string) {
  if (!cursor) search.value = query.value
  void run(
    () => client.list(search.value, cursor),
    (v) => {
      page.value = v
    },
  )
}
function open(value = id.value) {
  if (uncertain.value && value !== pending?.id) return
  void run(
    () => client.read(value),
    (v) => {
      apply(v)
      if (pending && v.metadata.operation === pending.body.operationId) uncertain.value = false
    },
  )
}
function replay() {
  const p = pending
  if (!p) return
  void runWrite(
    () => client.change(p.id, p.body),
    (v) => {
      apply(v)
      page.value = undefined
    },
  )
}
function save() {
  if (!current.value || !draft.value || busy.value || uncertain.value) return
  try {
    const definition = catalogDefinition({
      ...toRaw(draft.value),
      supersedes: JSON.parse(supersedes.value),
    })
    pending = {
      id: current.value.resource.id,
      body: operation({ action: 'put', ...definition }, current.value.metadata.revision),
    }
    replay()
  } catch {
    failure.value = 'invalidRequest'
  }
}
function resetLicense() {
  if (!draft.value) return
  draft.value.license.seats = null
  draft.value.license.expiresAt = null
}
watch(
  () => route.fullPath,
  () => {
    current.value = undefined
    draft.value = undefined
    pending = undefined
    id.value = ''
    selectedVersion.value = ''
    supersedes.value = '[]'
    page.value = undefined
    query.value = search.value = ''
    if (typeof route.query['resource'] === 'string') open(route.query['resource'])
    else list()
  },
  { immediate: true },
)
</script>
<template>
  <SoftwareFrame :title="t('software.catalog')" :busy="busy" :failure="failure">
    <p>{{ t('software.catalogHint') }}</p>
    <RouterLink
      :to="{
        name: 'policy-resources',
        params: { tenant: runtime.tenant },
        query: { kind: 'software' },
      }"
      >{{ t('software.authorPackage') }}</RouterLink
    >
    <form @submit.prevent="list()">
      <label for="software-search">{{ t('software.search') }}</label
      ><input id="software-search" v-model="query" :disabled="busy || uncertain" /><button
        :disabled="busy || uncertain"
      >
        {{ t('policies.reload') }}
      </button>
    </form>
    <p v-if="page && !page.items.length">{{ t('policies.empty') }}</p>
    <ul>
      <li v-for="item in page?.items" :key="item.resource.id">
        <button :disabled="busy || uncertain" @click="open(item.resource.id)">
          {{ item.metadata.definition.title }} · {{ item.resource.id }}
        </button>
      </li>
    </ul>
    <button v-if="page?.nextCursor" :disabled="busy || uncertain" @click="list(page.nextCursor)">
      {{ t('policies.next') }}
    </button>
    <form @submit.prevent="open()">
      <label for="catalog-id">Resource ID</label
      ><input id="catalog-id" v-model="id" :disabled="busy || uncertain" required /><button
        :disabled="busy || uncertain"
      >
        {{ t('policies.open') }}
      </button>
    </form>
    <template v-if="current && draft">
      <h2>{{ current.metadata.definition.title }}</h2>
      <RouterLink
        :to="{
          name: 'policy-resources',
          params: { tenant: runtime.tenant },
          query: { resource: current.resource.id },
        }"
        >{{ t('software.authorPackage') }}</RouterLink
      >
      <form @submit.prevent="save">
        <fieldset :disabled="busy || uncertain">
          <label for="catalog-title">{{ t('software.catalogTitle') }}</label
          ><input id="catalog-title" v-model="draft.title" required />
          <label for="catalog-category">{{ t('software.category') }}</label
          ><input id="catalog-category" v-model="draft.category" />
          <label for="catalog-description">{{ t('software.description') }}</label
          ><input id="catalog-description" v-model="draft.description" />
          <label for="catalog-license">{{ t('software.license') }}</label
          ><select id="catalog-license" v-model="draft.license.kind" @change="resetLicense">
            <option v-for="kind in ['unknown', 'free', 'commercial']" :key="kind" :value="kind">
              {{ t(`software.license_${kind}`) }}
            </option>
          </select>
          <template v-if="draft.license.kind === 'commercial'">
            <label for="catalog-seats">{{ t('software.licenseSeats') }}</label
            ><input
              id="catalog-seats"
              :value="draft.license.seats"
              type="number"
              min="0"
              @input="
                draft.license.seats =
                  ($event.target as HTMLInputElement).value === ''
                    ? null
                    : Number(($event.target as HTMLInputElement).value)
              "
            />
            <label for="catalog-expiry">{{ t('software.licenseExpiry') }}</label
            ><input
              id="catalog-expiry"
              :value="draft.license.expiresAt"
              type="number"
              min="0"
              @input="
                draft.license.expiresAt =
                  ($event.target as HTMLInputElement).value === ''
                    ? null
                    : Number(($event.target as HTMLInputElement).value)
              "
            />
          </template>
          <label for="catalog-supersedes">{{ t('software.supersedes') }}</label
          ><textarea id="catalog-supersedes" v-model="supersedes" />
          <p>{{ t('software.supersedenceHint') }}</p>
          <button type="submit">{{ t('policies.save') }}</button>
        </fieldset>
      </form>
      <h3>{{ t('software.usage') }}</h3>
      <p>{{ t('software.usageHint') }}</p>
      <dl>
        <dt>{{ t('software.activeDevices') }}</dt>
        <dd>{{ current.usage.activeDevices ?? t('software.unknown') }}</dd>
        <dt>{{ t('software.sampleDevices') }}</dt>
        <dd>{{ current.usage.sampledDevices }} / {{ current.usage.totalDevices }}</dd>
        <dt>{{ t('software.unknown') }}</dt>
        <dd>{{ current.usage.unknownDevices }}</dd>
        <dt>{{ t('software.observation') }}</dt>
        <dd>
          {{ current.usage.asOf ?? '—' }} · {{ current.usage.windowDays }}
          {{ t('software.days') }} · {{ t(`software.usage_${current.usage.source}`) }}
        </dd>
      </dl>
      <label for="catalog-version">{{ t('software.resourceVersion') }}</label
      ><select id="catalog-version" v-model="selectedVersion">
        <option v-for="v in current.resource.versions" :key="v.id" :value="v.id">
          {{ v.id }} · {{ v.state }}
        </option>
      </select>
      <template
        v-for="v in current.resource.versions.filter((v) => v.id === selectedVersion)"
        :key="v.id"
      >
        <table>
          <thead>
            <tr>
              <th>{{ t('policies.platform') }}</th>
              <th>{{ t('policies.architecture') }}</th>
              <th>{{ t('policies.variant') }}</th>
              <th>{{ t('software.package') }}</th>
              <th>{{ t('software.dependencies') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="variant in v.variants"
              :key="`${variant.platform}/${variant.architecture}/${variant.key}`"
            >
              <td>{{ variant.platform }}</td>
              <td>{{ variant.architecture }}</td>
              <td>{{ variant.key }}</td>
              <td>
                {{
                  variant.declaration.kind === 'software'
                    ? `${variant.declaration.definition.package} / ${variant.declaration.definition.version}`
                    : '—'
                }}
              </td>
              <td>
                <ul v-if="variant.declaration.kind === 'software'">
                  <li
                    v-for="d in variant.declaration.definition.dependencies"
                    :key="`${d.resource}/${d.version}`"
                  >
                    {{ d.resource }} / {{ d.version }}
                  </li>
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
        <VersionAdmission
          v-if="v.state !== 'archived'"
          :key="`${current.resource.id}/${v.id}`"
          :resource="current.resource.id"
          :version="v.id"
        />
      </template>
    </template>
    <div v-if="uncertain">
      <button :disabled="busy" @click="open(pending?.id)">{{ t('software.reconcile') }}</button
      ><button :disabled="busy" @click="replay">{{ t('policies.replay') }}</button>
    </div>
  </SoftwareFrame>
</template>
