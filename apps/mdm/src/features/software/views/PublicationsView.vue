<script setup lang="ts">
import { UiButton } from '@rss/core/components'
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
import PageFrame from '../../../components/PageFrame.vue'
const creating = ref(false)
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
      creating.value = false
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
  creating.value = true
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
      creating.value = false
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
      creating.value = false
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
  <PageFrame :title="t('software.publications')" :busy="busy" :failure="failure">
    <p>{{ t('software.publicationHint') }}</p>
    <UiButton :disabled="!!busy" type="submit" @click="list()">{{ t('policies.reload') }}</UiButton>
    <p v-if="directory && !directory.items.length">{{ t('policies.empty') }}</p>
    <ul class="console-object-list">
      <li v-for="entry in directory?.items" :key="`${entry.source}/${entry.id}`">
        <UiButton
          :disabled="!!(busy || uncertain)"
          type="submit"
          @click="openCandidate(entry.source, entry.id)"
        >
          {{ entry.source }} / {{ entry.id }} · {{ t(`software.disposition_${entry.disposition}`) }}
        </UiButton>
      </li>
    </ul>
    <UiButton
      v-if="directory?.nextCursor"
      :disabled="!!busy"
      type="submit"
      @click="list(directory.nextCursor)"
    >
      {{ t('policies.next') }}
    </UiButton>
    <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="create">{{
      t('policies.create')
    }}</UiButton>
    <details class="console-panel console-task" :open="uncertain || undefined">
      <summary>{{ t('console.advanced') }}</summary>
      <form @submit.prevent="load">
        <fieldset :disabled="busy || uncertain">
          <label for="publication-source">{{ t('software.publicationSource') }}</label
          ><input
            id="publication-source"
            v-model="source"
            class="ui-input"
            :readonly="!!current"
            required
          />
          <label for="publication-id">{{ t('software.candidateId') }}</label
          ><input
            id="publication-id"
            v-model="id"
            class="ui-input"
            :readonly="!!current"
            required
          />
          <UiButton type="submit">{{ t('policies.open') }}</UiButton>
        </fieldset>
      </form>
    </details>
    <section v-if="!current && creating" class="console-panel">
      <h2>{{ t('console.create') }}</h2>
      <form @submit.prevent="submit">
        <fieldset :disabled="busy || uncertain">
          <label for="publication-resource">{{ t('software.resourceId') }}</label
          ><input id="publication-resource" v-model="resource" class="ui-input" required />
          <label for="publication-version">{{ t('software.resourceVersion') }}</label
          ><input id="publication-version" v-model="version" class="ui-input" required />
          <label for="publication-resource-revision">{{ t('software.resourceRevision') }}</label
          ><input
            id="publication-resource-revision"
            v-model.number="resourceRevision"
            class="ui-input"
            type="number"
            min="1"
            required
          />
          <label for="publication-payload">{{ t('software.publicationPayload') }}</label
          ><textarea
            id="publication-payload"
            v-model="payload"
            class="ui-input"
            rows="10"
            required
          />
          <UiButton type="submit" :disabled="!!(!source || !id)">
            {{ t('software.createCandidate') }}
          </UiButton>
        </fieldset>
      </form>
    </section>
    <template v-if="current">
      <dl>
        <dt>{{ t('policies.status') }}</dt>
        <dd>{{ t(`software.disposition_${current.disposition}`) }}</dd>
        <dt>{{ t('software.resourceRevision') }}</dt>
        <dd>{{ current.revision }}</dd>
        <dt>{{ t('software.contentDigest') }}</dt>
        <dd class="console-wrap">{{ current.contentDigest.join(',') }}</dd>
      </dl>
      <p>{{ t('software.actorSeparation') }}</p>
      <label for="publication-publisher">{{ t('software.publisherSubject') }}</label
      ><input
        id="publication-publisher"
        v-model="publisher"
        class="ui-input"
        :disabled="busy || uncertain"
      />
      <article v-for="state in current.rings" :key="state.ring" class="console-panel">
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
        <div class="console-inline-actions">
          <UiButton
            :disabled="
              !!(busy || uncertain || current.disposition !== 'active' || !!state.publication)
            "
            type="submit"
            @click="change({ action: 'validate', ring: state.ring })"
          >
            {{ t('software.validateRelease') }}
          </UiButton>
          <UiButton
            :disabled="
              !!(
                busy ||
                uncertain ||
                current.disposition !== 'active' ||
                state.state !== 'validated' ||
                !publisher
              )
            "
            type="submit"
            @click="change({ action: 'approve', ring: state.ring, publisherSubject: publisher })"
          >
            {{ t('software.approveRelease') }}
          </UiButton>
          <UiButton
            :disabled="
              !!(
                busy ||
                uncertain ||
                current.disposition !== 'active' ||
                state.state !== 'approved'
              )
            "
            type="submit"
            @click="change({ action: 'authorize', ring: state.ring })"
          >
            {{ t('software.authorizeRelease') }}
          </UiButton>
          <template v-if="state.publication">
            <UiButton
              :disabled="
                !!(
                  busy ||
                  uncertain ||
                  current.disposition !== 'active' ||
                  state.publication.outcome !== 'unknown'
                )
              "
              type="submit"
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
            </UiButton>
            <UiButton
              :disabled="!!(busy || uncertain)"
              type="submit"
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
            </UiButton>
            <UiButton
              :disabled="
                !!(
                  busy ||
                  uncertain ||
                  current.disposition !== 'active' ||
                  state.publication.outcome !== 'not_applied'
                )
              "
              type="submit"
              @click="
                change({ action: 'retry', ring: state.ring, attempt: state.publication.attempt })
              "
            >
              {{ t('software.retryRelease') }}
            </UiButton>
          </template>
          <UiButton
            :data-action="`withdraw-${state.ring}`"
            :disabled="!!(busy || uncertain || current.disposition === 'quarantined')"
            type="submit"
            @click="change({ action: 'withdraw', ring: state.ring })"
          >
            {{ t('software.withdrawRelease') }}
          </UiButton>
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
      <UiButton data-action="reconcile" :disabled="!!busy" type="submit" @click="load">
        {{ t('software.reconcile') }}
      </UiButton>
      <UiButton data-action="replay" :disabled="!!busy" type="submit" @click="replay">
        {{ t('policies.replay') }}
      </UiButton>
      <UiButton v-if="recovery" :disabled="!!busy" type="submit" @click="recover">
        {{ t('software.recoverRelease') }}
      </UiButton>
    </div>
  </PageFrame>
</template>
