<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation, type Operation } from '../../../services/useOperation'
import type { Publication, PublicationChange, Publish } from '../clients/publication'
import { deviceBinding } from '../../devices/useDeviceBinding'
import SoftwareResourceSelect from '../components/SoftwareResourceSelect.vue'
import PageFrame from '../../../components/PageFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.software.publication,
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const target = ref(''),
  resource = ref(''),
  version = ref(''),
  current = ref<Publication>(),
  page = ref<Awaited<ReturnType<typeof client.list>>>(),
  targets = ref<Awaited<ReturnType<typeof client.targets>>>(),
  confirmedReplay = ref(false)
let pending: { id: string; body: Operation<PublicationChange> } | undefined
function load(after?: string) {
  void run(
    () => client.list({ after }),
    (v) => {
      page.value = v
    },
  )
}
function loadTargets(after?: string) {
  void run(
    () => client.targets(after),
    (v) => {
      targets.value = v
    },
  )
}
function open(id: string) {
  void run(
    () => client.read(id),
    (v) => {
      current.value = v
    },
  )
}
function create() {
  if (busy.value || uncertain.value) return
  current.value = undefined
  pending = undefined
  confirmedReplay.value = false
}
async function save() {
  if (busy.value || uncertain.value) return
  const selected = targets.value?.items.find((v) => v.id === target.value)
  if (!selected) {
    failure.value = 'invalidRequest'
    return
  }
  const binding = JSON.stringify(deviceBinding(runtime))
  const r = resource.value,
    v = version.value,
    selectedTarget = { id: selected.id, digest: [...selected.digest] }
  let input: Publish | undefined
  const loaded = await run(
    async () => {
      const [header, version] = await Promise.all([
        runtime.policies.resources.read(r),
        runtime.software.lifecycle.version(r, v),
      ])
      if (header.kind !== 'software') throw new Error('Wrong resource')
      return {
        action: 'publish' as const,
        resource: r,
        version: v,
        expectedResourceRevision: header.revision,
        resourceDigest: version.resourceDigest,
        target: selectedTarget.id,
        targetDigest: selectedTarget.digest,
      }
    },
    (v) => {
      input = v
    },
  )
  if (!loaded || !input || binding !== JSON.stringify(deviceBinding(runtime))) return
  const body = operation(input)
  pending = { id: body.operationId, body }
  confirmedReplay.value = false
  void runWrite(
    () => client.publish(body),
    (v) => {
      current.value = v
      pending = undefined
    },
  )
}
function change(action: 'recover' | 'retry' | 'withdraw') {
  if (busy.value || uncertain.value || !current.value) return
  const id = current.value.id,
    body = operation({ action }, current.value.revision)
  pending = { id, body }
  confirmedReplay.value = false
  void runWrite(
    () => client.change(id, body),
    (v) => {
      current.value = v
      pending = undefined
    },
  )
}
function reconcile() {
  if (!pending) {
    if (current.value) open(current.value.id)
    return
  }
  const original = pending
  void run(
    async () => {
      const result = await client.list({ operationId: original.body.operationId })
      const found = result.items.find((v) => v.id === original.id)
      return found ? client.read(found.id) : undefined
    },
    (v) => {
      if (v) current.value = v
    },
  )
}
function replay() {
  if (busy.value || !confirmedReplay.value || !pending) return
  const original = pending,
    input = original.body.input
  confirmedReplay.value = false
  void runWrite(
    () =>
      input.action === 'publish'
        ? client.publish({ ...original.body, input })
        : client.change(original.id, { ...original.body, input }),
    (v) => {
      current.value = v
      pending = undefined
    },
  )
}
watch(
  () => deviceBinding(runtime),
  () => {
    current.value = undefined
    page.value = undefined
    targets.value = undefined
    pending = undefined
    confirmedReplay.value = false
    target.value = ''
    resource.value = ''
    version.value = ''
  },
  { flush: 'sync' },
)
onMounted(() => load())
</script>
<template>
  <PageFrame :title="t('software.publications')" :busy="busy" :failure="failure">
    <p>{{ t('software.directPublicationHint') }}</p>
    <UiButton :disabled="busy || uncertain" @click="create">{{
      t('software.newPublication')
    }}</UiButton>
    <UiButton :disabled="busy || uncertain" @click="load()">{{
      t('software.publicationRecords')
    }}</UiButton>
    <section v-if="page" class="console-panel">
      <p v-if="!page.items.length">{{ t('policies.empty') }}</p>
      <article v-for="item in page.items" :key="item.id">
        <p>
          {{ item.resource }} / {{ item.version }} · {{ item.target }} ·
          {{ t(`software.publication_${item.outcome}`) }}
        </p>
        <p v-if="item.withdrawn">{{ t('software.lifecycle_withdrawn') }}</p>
        <UiButton :disabled="busy || uncertain" @click="open(item.id)">{{
          t('policies.open')
        }}</UiButton>
      </article>
      <UiButton
        v-if="page.nextCursor"
        :disabled="busy || uncertain"
        @click="load(page.nextCursor)"
        >{{ t('devices.next') }}</UiButton
      >
    </section>
    <form v-if="!current" data-testid="publication-create" @submit.prevent="save">
      <fieldset :disabled="busy || uncertain">
        <legend>{{ t('software.newPublication') }}</legend>
        <SoftwareResourceSelect
          v-model:resource="resource"
          v-model:version="version"
          :disabled="busy || uncertain"
        />
        <UiButton type="button" @click="loadTargets()">{{ t('software.loadTargets') }}</UiButton>
        <label for="publication-target">{{ t('software.binding') }}</label>
        <select id="publication-target" v-model="target" class="ui-input" required>
          <option value="">{{ t('devices.select') }}</option>
          <option v-for="item in targets?.items" :key="item.id" :value="item.id">
            {{ item.id }} · {{ item.protocol }}
          </option>
        </select>
        <p v-if="targets && !targets.items.length">{{ t('software.noTargets') }}</p>
        <UiButton
          v-if="targets?.nextCursor"
          type="button"
          @click="loadTargets(targets.nextCursor)"
          >{{ t('devices.next') }}</UiButton
        >
        <UiButton type="submit" :disabled="!resource || !version || !target">{{
          t('software.publish')
        }}</UiButton>
      </fieldset>
    </form>
    <section v-if="current" class="console-panel" data-testid="publication-detail">
      <h2>{{ current.resource }} / {{ current.version }}</h2>
      <p>{{ current.target }} · {{ t(`software.publication_${current.outcome}`) }}</p>
      <p>{{ current.id }} · {{ t('software.publicationAttempt') }} {{ current.attempt }}</p>
      <p v-if="current.withdrawn">
        {{ t('software.lifecycle_withdrawn') }} ·
        {{ current.withdrawal ? t(`software.withdrawal_${current.withdrawal}`) : '' }}
      </p>
      <UiButton :disabled="busy" @click="reconcile">{{ t('software.reconcile') }}</UiButton>
      <UiButton
        v-if="
          ['pending', 'unknown'].includes(current.outcome) ||
          (current.withdrawal &&
            current.withdrawal !== 'withdrawn' &&
            current.withdrawal !== 'not_published')
        "
        :disabled="busy || uncertain"
        @click="change('recover')"
        >{{ t('software.recoverPublication') }}</UiButton
      >
      <UiButton
        v-if="current.outcome === 'not_applied' && !current.withdrawn"
        :disabled="busy || uncertain"
        @click="change('retry')"
        >{{ t('software.retry') }}</UiButton
      >
      <UiButton
        v-if="!current.withdrawn"
        :disabled="busy || uncertain"
        @click="change('withdraw')"
        >{{ t('software.withdraw') }}</UiButton
      >
      <p>{{ t('software.withdrawHint') }}</p>
      <details v-if="current.document">
        <summary>{{ t('software.document') }}</summary>
        <pre>{{ JSON.stringify(current.document, null, 2) }}</pre>
      </details>
    </section>
    <section v-if="uncertain && pending" class="console-panel" data-testid="publication-unknown">
      <p>{{ t('software.publicationUnknown') }}</p>
      <p>{{ pending.body.operationId }}</p>
      <UiButton :disabled="busy" @click="reconcile">{{ t('software.lookupOperation') }}</UiButton>
      <label
        ><input v-model="confirmedReplay" type="checkbox" :disabled="busy" />{{
          t('policies.confirmReplay')
        }}</label
      >
      <UiButton :disabled="busy || !confirmedReplay" @click="replay">{{
        t('policies.replay')
      }}</UiButton>
    </section>
  </PageFrame>
</template>
