<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import { rings, type Ring, type Publication, type PublicationChange } from '../clients/publication'
import { deviceBinding } from '../../devices/useDeviceBinding'
import PageFrame from '../../../components/PageFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.software.publication,
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const source = ref(''),
  id = ref(''),
  resource = ref(''),
  version = ref('1'),
  current = ref<Publication>()
let selected: { source: string; id: string } | undefined
function create() {
  if (busy.value || uncertain.value) return
  current.value = undefined
  selected = undefined
  id.value = ''
  resource.value = ''
}
function read() {
  const target = uncertain.value && selected ? selected : { source: source.value, id: id.value }
  void run(
    () => client.read(target.source, target.id),
    (v) => {
      selected = target
      current.value = v
    },
  )
}
function change(input: PublicationChange, recovery = false) {
  if (busy.value || (uncertain.value && !recovery)) return
  const target = selected ?? { source: source.value, id: id.value }
  const body = operation(input, current.value?.revision ?? 0)
  selected = target
  void runWrite(
    () => client.change(target.source, target.id, body),
    (v) => {
      current.value = v
    },
  )
}
async function save() {
  if (busy.value || uncertain.value) return
  const target = { source: source.value, id: id.value },
    r = resource.value,
    v = version.value
  let basis: { revision: number; digest: number[] } | undefined
  const loaded = await run(
    async () => {
      const [resource, version] = await Promise.all([
        runtime.policies.resources.read(r),
        runtime.software.lifecycle.version(r, v),
      ])
      return { revision: resource.revision, digest: version.resourceDigest }
    },
    (value) => {
      basis = value
    },
  )
  if (loaded && basis) {
    selected = target
    change({
      action: 'candidate',
      resource: r,
      version: v,
      expectedResourceRevision: basis.revision,
      resourceDigest: basis.digest,
    })
  }
}
function canPublish(index: number) {
  return (
    !!current.value &&
    current.value.disposition === 'active' &&
    !current.value.rings[index]?.publication &&
    (index === 0 || current.value.rings[index - 1]?.publication?.outcome === 'published')
  )
}
function recover(ring: Ring) {
  const p = current.value?.rings.find((r) => r.ring === ring)?.publication
  if (p) change({ action: 'recover', ring, publication: p.id, attempt: p.attempt }, true)
}
function retry(ring: Ring) {
  const p = current.value?.rings.find((r) => r.ring === ring)?.publication
  if (p?.outcome === 'not_applied') change({ action: 'retry', ring, attempt: p.attempt })
}
watch(
  () => deviceBinding(runtime),
  () => {
    current.value = undefined
    selected = undefined
    source.value = ''
    id.value = ''
    resource.value = ''
  },
  { flush: 'sync' },
)
</script>
<template>
  <PageFrame :title="t('software.publications')" :busy="busy" :failure="failure">
    <p>{{ t('software.discoveryUnavailable') }}</p>
    <form @submit.prevent="read">
      <fieldset :disabled="busy || uncertain">
        <label
          >{{ t('software.binding') }}<input v-model="source" class="ui-input" required /></label
        ><label>{{ t('policies.id') }}<input v-model="id" class="ui-input" required /></label
        ><UiButton type="submit">{{ t('policies.open') }}</UiButton>
      </fieldset>
    </form>
    <UiButton :disabled="busy || uncertain" @click="create">{{ t('policies.create') }}</UiButton>
    <details class="console-panel">
      <summary>{{ t('software.saveDraft') }}</summary>
      <form @submit.prevent="save">
        <fieldset :disabled="busy || uncertain || !!current">
          <label
            >{{ t('software.resource')
            }}<input v-model="resource" class="ui-input" required /></label
          ><label
            >{{ t('software.version') }}<input v-model="version" class="ui-input" required /></label
          ><UiButton type="submit">{{ t('software.saveDraft') }}</UiButton>
        </fieldset>
      </form>
    </details>
    <UiButton :disabled="busy" @click="read">{{ t('software.reconcile') }}</UiButton
    ><template v-if="current"
      ><p>{{ current.id }} · {{ current.revision }} · {{ current.disposition }}</p>
      <p>{{ t('software.saveNotPublish') }}</p>
      <section v-for="(ring, index) in rings" :key="ring" class="console-panel">
        <h2>{{ t(`software.ring_${ring}`) }}</h2>
        <p>{{ current.rings[index]?.publication?.outcome ?? t('software.draft') }}</p>
        <p v-if="current.rings[index]?.publication">
          {{ current.rings[index]?.publication?.id.join(' ') }} ·
          {{ current.rings[index]?.publication?.attempt }}
        </p>
        <UiButton
          :disabled="busy || uncertain || !canPublish(index)"
          @click="change({ action: 'publish', ring })"
          >{{ t('software.publish') }}</UiButton
        >
        <UiButton
          v-if="['pending', 'unknown'].includes(current.rings[index]?.publication?.outcome ?? '')"
          :disabled="busy"
          @click="recover(ring)"
          >{{ t('software.reconcile') }}</UiButton
        >
        <UiButton
          v-if="current.rings[index]?.publication?.outcome === 'not_applied'"
          :disabled="busy || uncertain"
          @click="retry(ring)"
          >{{ t('software.retry') }}</UiButton
        >
        <UiButton
          v-if="current.rings[index]?.publication?.outcome === 'published'"
          :disabled="busy || uncertain"
          @click="change({ action: 'withdraw', ring })"
          >{{ t('software.withdraw') }}</UiButton
        >
      </section>
      <details v-if="current.document">
        <summary>{{ t('software.document') }}</summary>
        <pre>{{ JSON.stringify(current.document, null, 2) }}</pre>
      </details></template
    >
  </PageFrame>
</template>
