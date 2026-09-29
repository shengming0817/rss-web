<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation, type Operation } from '../../../services/useOperation'
import {
  submission,
  type Publication,
  type PublicationChange,
  type Ring,
} from '../clients/publication'
import SoftwareFrame from '../components/SoftwareFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.software.publication
const { run, runWrite, busy, failure, uncertain } = useOperation()
const source = ref(''),
  id = ref(''),
  resource = ref(''),
  version = ref(''),
  resourceRevision = ref(0),
  payload = ref(''),
  publisher = ref('')
const current = ref<Publication>(),
  selected = ref<{ source: string; id: string }>()
const acknowledgement = ref<{ ring: Ring; operationId: string }>()
const directory = ref<Awaited<ReturnType<typeof runtime.software.catalog.publications>>>()
function list(cursor?: string) {
  void run(
    () => runtime.software.catalog.publications(cursor),
    (v) => {
      directory.value = v
    },
  )
}
function openCandidate(sourceId: string, candidateId: string) {
  if (busy.value || uncertain.value) return
  void run(
    () => client.read(sourceId, candidateId),
    (v) => {
      if (selected.value?.source !== sourceId || selected.value?.id !== candidateId)
        publisher.value = ''
      current.value = v
      source.value = sourceId
      id.value = candidateId
      selected.value = { source: sourceId, id: candidateId }
      acknowledgement.value = undefined
    },
  )
}
let pending: { source: string; id: string; body: Operation<PublicationChange> } | undefined
const recovery = computed(() => {
  const input = pending?.body.input
  if (
    !uncertain.value ||
    !current.value ||
    !input ||
    !['publish', 'recover'].includes(input.action) ||
    !('publication' in input)
  )
    return null
  const p = current.value.rings.find((r) => r.ring === input.ring)?.publication
  return p &&
    p.attempt === input.attempt &&
    JSON.stringify(p.id) === JSON.stringify(input.publication)
    ? { ring: input.ring, publication: p.id, attempt: p.attempt }
    : null
})
function create() {
  if (busy.value || uncertain.value) return
  current.value = undefined
  selected.value = undefined
  pending = undefined
  acknowledgement.value = undefined
  id.value = ''
  publisher.value = ''
  resource.value = ''
  version.value = ''
  payload.value = ''
  resourceRevision.value = 0
}
function load() {
  const target =
    pending && uncertain.value
      ? { source: pending.source, id: pending.id }
      : { source: source.value, id: id.value }
  void run(
    () => client.read(target.source, target.id),
    (value) => {
      if (selected.value?.source !== target.source || selected.value?.id !== target.id)
        publisher.value = ''
      current.value = value
      selected.value = target
      // This native read has no operation receipt, so it cannot settle an unknown write.
    },
  )
}
function replay() {
  const p = pending
  if (!p) return
  void runWrite(
    () => client.change(p.source, p.id, p.body),
    (value) => {
      current.value = value
      selected.value = { source: p.source, id: p.id }
      publisher.value = ''
      if (p.body.input.action === 'withdraw')
        acknowledgement.value = { ring: p.body.input.ring, operationId: p.body.operationId }
    },
  )
}
function change(input: PublicationChange, reconciling = false) {
  if (busy.value || (uncertain.value && !reconciling)) return
  pending = {
    ...(selected.value ?? { source: source.value, id: id.value }),
    body: operation(input, current.value?.revision ?? 0),
  }
  acknowledgement.value = undefined
  replay()
}
function submit() {
  try {
    change({
      action: 'candidate',
      resource: resource.value,
      version: version.value,
      expectedResourceRevision: resourceRevision.value,
      submission: submission(JSON.parse(payload.value)),
    })
  } catch {
    failure.value = 'invalidRequest'
  }
}
function recover() {
  const target = recovery.value
  if (target) change({ action: 'recover', ...target }, true)
}
onMounted(() => list())
</script>
<template>
  <SoftwareFrame :title="t('software.publications')" :busy="busy" :failure="failure">
    <p>{{ t('software.publicationHint') }}</p>
    <button :disabled="busy" @click="list()">{{ t('policies.reload') }}</button>
    <p v-if="directory && !directory.items.length">{{ t('policies.empty') }}</p>
    <ul>
      <li v-for="entry in directory?.items" :key="`${entry.source}/${entry.id}`">
        <button :disabled="busy || uncertain" @click="openCandidate(entry.source, entry.id)">
          {{ entry.source }} / {{ entry.id }} · {{ t(`software.disposition_${entry.disposition}`) }}
        </button>
      </li>
    </ul>
    <button v-if="directory?.nextCursor" :disabled="busy" @click="list(directory.nextCursor)">
      {{ t('policies.next') }}
    </button>
    <button :disabled="busy || uncertain" @click="create">{{ t('policies.create') }}</button>
    <form @submit.prevent="load">
      <fieldset :disabled="busy || uncertain">
        <label for="publication-source">{{ t('software.publicationSource') }}</label
        ><input id="publication-source" v-model="source" :readonly="!!current" required />
        <label for="publication-id">{{ t('software.candidateId') }}</label
        ><input id="publication-id" v-model="id" :readonly="!!current" required />
        <button type="submit">{{ t('policies.open') }}</button>
      </fieldset>
    </form>
    <form v-if="!current" @submit.prevent="submit">
      <fieldset :disabled="busy || uncertain">
        <label for="publication-resource">{{ t('software.resourceId') }}</label
        ><input id="publication-resource" v-model="resource" required />
        <label for="publication-version">{{ t('software.resourceVersion') }}</label
        ><input id="publication-version" v-model="version" required />
        <label for="publication-resource-revision">{{ t('software.resourceRevision') }}</label
        ><input
          id="publication-resource-revision"
          v-model.number="resourceRevision"
          type="number"
          min="1"
          required
        />
        <label for="publication-payload">{{ t('software.publicationPayload') }}</label
        ><textarea id="publication-payload" v-model="payload" rows="10" required />
        <button type="submit" :disabled="!source || !id">
          {{ t('software.createCandidate') }}
        </button>
      </fieldset>
    </form>
    <template v-if="current">
      <dl>
        <dt>{{ t('policies.status') }}</dt>
        <dd>{{ t(`software.disposition_${current.disposition}`) }}</dd>
        <dt>{{ t('software.resourceRevision') }}</dt>
        <dd>{{ current.revision }}</dd>
        <dt>{{ t('software.contentDigest') }}</dt>
        <dd class="device-wrap">{{ current.contentDigest.join(',') }}</dd>
      </dl>
      <p>{{ t('software.actorSeparation') }}</p>
      <label for="publication-publisher">{{ t('software.publisherSubject') }}</label
      ><input id="publication-publisher" v-model="publisher" :disabled="busy || uncertain" />
      <article v-for="state in current.rings" :key="state.ring">
        <h2>{{ t(`software.ring_${state.ring}`) }}</h2>
        <p>
          {{ t(`software.release_${state.state}`)
          }}<span v-if="state.publication">
            · {{ t(`software.publication_${state.publication.outcome}`) }} ·
            {{ t('software.attempt') }} {{ state.publication.attempt }}</span
          >
        </p>
        <dl v-if="state.approval">
          <dt>{{ t('software.approver') }}</dt>
          <dd>{{ state.approval.approver }}</dd>
          <dt>{{ t('software.publisherSubject') }}</dt>
          <dd>{{ state.approval.publisher }}</dd>
        </dl>
        <div class="device-actions">
          <button
            :disabled="busy || uncertain || current.disposition !== 'active' || !!state.publication"
            @click="change({ action: 'validate', ring: state.ring })"
          >
            {{ t('software.validateRelease') }}
          </button>
          <button
            :disabled="
              busy ||
              uncertain ||
              current.disposition !== 'active' ||
              state.state !== 'validated' ||
              !publisher
            "
            @click="change({ action: 'approve', ring: state.ring, publisherSubject: publisher })"
          >
            {{ t('software.approveRelease') }}
          </button>
          <button
            :disabled="
              busy || uncertain || current.disposition !== 'active' || state.state !== 'approved'
            "
            @click="change({ action: 'authorize', ring: state.ring })"
          >
            {{ t('software.authorizeRelease') }}
          </button>
          <template v-if="state.publication">
            <button
              :disabled="
                busy ||
                uncertain ||
                current.disposition !== 'active' ||
                state.publication.outcome !== 'unknown'
              "
              @click="
                change({
                  action: 'publish',
                  ring: state.ring,
                  publication: state.publication.id,
                  attempt: state.publication.attempt,
                })
              "
            >
              {{ t('software.publishRelease') }}
            </button>
            <button
              :disabled="busy || uncertain"
              @click="
                change({
                  action: 'recover',
                  ring: state.ring,
                  publication: state.publication.id,
                  attempt: state.publication.attempt,
                })
              "
            >
              {{ t('software.recoverRelease') }}
            </button>
            <button
              :disabled="
                busy ||
                uncertain ||
                current.disposition !== 'active' ||
                state.publication.outcome !== 'not_applied'
              "
              @click="
                change({ action: 'retry', ring: state.ring, attempt: state.publication.attempt })
              "
            >
              {{ t('software.retryRelease') }}
            </button>
          </template>
          <button
            :data-action="`withdraw-${state.ring}`"
            :disabled="busy || uncertain || current.disposition === 'quarantined'"
            @click="change({ action: 'withdraw', ring: state.ring })"
          >
            {{ t('software.withdrawRelease') }}
          </button>
        </div>
      </article>
      <p>{{ t('software.withdrawalHint') }}</p>
      <p v-if="acknowledgement" data-withdrawal-ack role="status">
        {{ t('software.withdrawalAcknowledged') }} ·
        {{ t(`software.ring_${acknowledgement.ring}`) }} · {{ acknowledgement.operationId }}
      </p>
      <details v-if="current.submission">
        <summary>{{ t('software.publicationPayload') }}</summary>
        <pre>{{ JSON.stringify(current.submission, null, 2) }}</pre>
      </details>
    </template>
    <div v-if="uncertain" role="status">
      <p>{{ t('software.publicationUnknown') }}</p>
      <button data-action="reconcile" :disabled="busy" @click="load">
        {{ t('software.reconcile') }}
      </button>
      <button data-action="replay" :disabled="busy" @click="replay">
        {{ t('policies.replay') }}
      </button>
      <button v-if="recovery" :disabled="busy" @click="recover">
        {{ t('software.recoverRelease') }}
      </button>
    </div>
  </SoftwareFrame>
</template>
