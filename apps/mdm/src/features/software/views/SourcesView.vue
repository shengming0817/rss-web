<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation, type Operation } from '../../../services/useOperation'
import type { SourceChange, SourceDefinition } from '../clients/admission'
import PageFrame from '../../../components/PageFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.software.admission,
  { run, runWrite, busy, failure, uncertain } = useOperation()
const id = ref(''),
  revision = ref('1'),
  kind = ref<SourceDefinition['kind']>('private'),
  location = ref(''),
  publishers = ref(''),
  evidence = ref(''),
  current = ref<Awaited<ReturnType<typeof client.source>>>()
const directory = ref<Awaited<ReturnType<typeof runtime.software.catalog.sources>>>()
function list(cursor?: string) {
  void run(
    () => runtime.software.catalog.sources(cursor),
    (v) => {
      directory.value = v
    },
  )
}
function openSource(sourceId: string, sourceRevision: string) {
  if (busy.value || uncertain.value) return
  void run(
    () => client.source(sourceId, sourceRevision),
    (v) => {
      if (
        current.value?.source.id !== sourceId ||
        current.value?.source.revision !== sourceRevision
      )
        evidence.value = ''
      current.value = v
      id.value = sourceId
      revision.value = sourceRevision
    },
  )
}
let pending: { id: string; revision: string; body: Operation<SourceChange> } | undefined
function create() {
  if (busy.value || uncertain.value) return
  current.value = undefined
  pending = undefined
  id.value = ''
  revision.value = '1'
  location.value = ''
  publishers.value = ''
  evidence.value = ''
}
function load() {
  const target = pending && uncertain.value ? pending : { id: id.value, revision: revision.value }
  void run(
    () => client.source(target.id, target.revision),
    (value) => {
      if (
        current.value?.source.id !== value.source.id ||
        current.value?.source.revision !== value.source.revision
      )
        evidence.value = ''
      current.value = value
      id.value = value.source.id
      revision.value = value.source.revision
      if (pending && value.admission.operation === pending.body.operationId) {
        uncertain.value = false
        evidence.value = ''
      }
    },
  )
}
function replay() {
  const p = pending
  if (!p) return
  void runWrite(
    () => client.changeSource(p.id, p.revision, p.body),
    (value) => {
      current.value = value
      evidence.value = ''
    },
  )
}
function change(input: SourceChange) {
  if (busy.value || uncertain.value) return
  pending = {
    id: current.value?.source.id ?? id.value,
    revision: current.value?.source.revision ?? revision.value,
    body: operation(input, current.value?.admission.revision ?? 0),
  }
  replay()
}
function register() {
  change({
    action: 'register',
    definition: {
      id: id.value,
      revision: revision.value,
      kind: kind.value,
      location: kind.value === 'private' ? null : location.value,
      publishers: publishers.value
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean),
    },
  })
}
onMounted(() => list())
</script>
<template>
  <PageFrame :title="t('software.sources')" :busy="busy" :failure="failure">
    <p>{{ t('software.admissionHint') }}</p>
    <UiButton :disabled="!!busy" type="submit" @click="list()">{{ t('policies.reload') }}</UiButton>
    <p v-if="directory && !directory.items.length">{{ t('policies.empty') }}</p>
    <ul>
      <li v-for="entry in directory?.items" :key="`${entry.source.id}/${entry.source.revision}`">
        <UiButton
          :disabled="!!(busy || uncertain)"
          type="submit"
          @click="openSource(entry.source.id, entry.source.revision)"
        >
          {{ entry.source.id }} / {{ entry.source.revision }} ·
          {{ t(`software.${entry.admission.state}`) }}
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
    <p v-if="directory?.bindings.length">
      {{ t('software.publicationSource') }}:
      {{ directory.bindings.map((b) => `${b.id} (${b.kind})`).join(', ') }}
    </p>
    <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="create">{{
      t('policies.create')
    }}</UiButton>
    <form @submit.prevent="load">
      <fieldset :disabled="busy || uncertain">
        <label for="source-id">{{ t('software.source') }}</label
        ><input id="source-id" v-model="id" class="ui-input" required :readonly="!!current" />
        <label for="source-revision">{{ t('software.sourceRevision') }}</label
        ><input
          id="source-revision"
          v-model="revision"
          class="ui-input"
          required
          :readonly="!!current"
        />
        <UiButton type="submit">{{ t('policies.open') }}</UiButton>
      </fieldset>
    </form>
    <form v-if="!current" @submit.prevent="register">
      <fieldset :disabled="busy || uncertain">
        <label for="source-kind">{{ t('software.sourceKind') }}</label
        ><select id="source-kind" v-model="kind" class="ui-input">
          <option value="private">{{ t('software.private') }}</option>
          <option value="winget">WinGet</option>
          <option value="brew">Homebrew</option>
        </select>
        <template v-if="kind !== 'private'"
          ><label for="source-location">{{ t('software.location') }}</label
          ><input
            id="source-location"
            v-model="location"
            class="ui-input"
            required
            :type="kind === 'winget' ? 'url' : 'text'"
        /></template>
        <label for="source-publishers">{{ t('software.publishers') }}</label
        ><textarea id="source-publishers" v-model="publishers" class="ui-input" />
        <UiButton type="submit" :disabled="!!(!id || !revision)">{{
          t('software.register')
        }}</UiButton>
      </fieldset>
    </form>
    <template v-if="current">
      <dl>
        <dt>{{ t('software.sourceKind') }}</dt>
        <dd>{{ current.source.kind }}</dd>
        <dt>{{ t('software.location') }}</dt>
        <dd>{{ current.source.location ?? '—' }}</dd>
        <dt>{{ t('software.publishers') }}</dt>
        <dd>{{ current.source.publishers.join(', ') || '—' }}</dd>
        <dt>{{ t('policies.status') }}</dt>
        <dd>{{ t(`software.${current.admission.state}`) }}</dd>
        <dt>{{ t('policies.revision') }}</dt>
        <dd>{{ current.admission.revision }}</dd>
        <dt>{{ t('software.sourceDigest') }}</dt>
        <dd>
          <code>{{
            current.snapshot.sha256.map((b) => b.toString(16).padStart(2, '0')).join('')
          }}</code>
        </dd>
        <dt>{{ t('software.evidence') }}</dt>
        <dd>{{ current.admission.evidence.join(' · ') || '—' }}</dd>
      </dl>
      <form
        @submit.prevent="
          change({
            action: current.admission.state === 'approved' ? 'withdraw' : 'approve',
            evidence: [evidence],
          })
        "
      >
        <fieldset :disabled="busy || uncertain">
          <label for="source-evidence">{{ t('software.evidence') }}</label
          ><input
            id="source-evidence"
            v-model="evidence"
            class="ui-input"
            required
            maxlength="1024"
          /><UiButton type="submit">
            {{
              current.admission.state === 'approved'
                ? t('software.withdrawAdmission')
                : t('software.approveAdmission')
            }}
          </UiButton>
        </fieldset>
      </form>
    </template>
    <UiButton v-if="current || uncertain" :disabled="!!busy" type="submit" @click="load">
      {{ t('policies.verify') }}
    </UiButton>
    <UiButton v-if="uncertain && pending" :disabled="!!busy" type="submit" @click="replay">
      {{ t('policies.replay') }}
    </UiButton>
  </PageFrame>
</template>
