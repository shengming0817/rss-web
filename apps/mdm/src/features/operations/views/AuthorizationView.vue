<script setup lang="ts">
import {
  VAlert,
  VBtn,
  VChip,
  VDataTable,
  VExpansionPanel,
  VExpansionPanelText,
  VExpansionPanelTitle,
  VExpansionPanels,
  VForm,
  VSelect,
  VTextField,
} from 'vuetify/components'
import OperationDialog from '../components/OperationDialog.vue'
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useIdentity } from '@rss/auth'
import { isRssApiError } from '@rss/api/mdm'
import { useMdm } from '../../../context'
import { uuid, closed } from '../../../services/decode'
import { useSettingsAction, useSettingsFacts } from '../../settings/useSettingsAction'
import {
  ruleForRealm,
  type Rule,
  type Grant,
  type Subject,
  type Revision,
} from '../clients/authorization'
import MdmPage from '../../../ui/MdmPage.vue'
import GrantFacts from '../components/GrantFacts.vue'
import PermissionChoices from '../components/PermissionChoices.vue'
import PrincipalChoice from '../components/PrincipalChoice.vue'
import type { LocalAccount } from '../components/authorization-presentation'
const runtime = useMdm(),
  identity = useIdentity(),
  route = useRoute(),
  { t } = useI18n(),
  client = runtime.operations.authorization,
  key = `authorization:${runtime.realm}`,
  { run, submit, busy, failure, pending, locked, compared, markCompared, resolveConflict } =
    useSettingsAction(() => key)
const page = ref<Awaited<ReturnType<typeof client.rules>>>(),
  effective = ref<Awaited<ReturnType<typeof client.effective>>>(),
  pageIndex = ref(0),
  cursors = ref<(string | undefined)[]>([undefined]),
  editorOpen = ref(false),
  id = ref(crypto.randomUUID() as string),
  revision = ref(0),
  kind = ref<Subject['kind']>('user'),
  subjectId = ref(''),
  provider = ref(''),
  issuer = ref(''),
  configurationVersion = ref(1),
  matching = ref('exact'),
  grants = ref<Grant[]>([]),
  baseline = ref<Rule | null>(null),
  preview = ref<'save' | 'delete'>(),
  remote = ref<Revision<Rule> | null>(),
  selectedDeleted = ref(false),
  accounts = ref<LocalAccount[]>([]),
  accountCursor = ref<string | null>(null),
  accountsRead = ref(false),
  directoryDenied = ref(false)
const bound = computed(() => {
    const s = runtime.session.state.value
    return (
      s.status === 'authenticated' &&
      s.tenant === runtime.tenant &&
      (!route.params['tenant'] || route.params['tenant'] === runtime.tenant)
    )
  }),
  platform = computed(() => runtime.realm === 'platform'),
  has = (permission: string) =>
    bound.value &&
    !!effective.value?.grants.some((g) => g.operation === permission && g.scope.kind === 'tenant'),
  canRead = computed(() => has('authorization_read')),
  canWrite = computed(() => has('authorization_write')),
  canBrowse = computed(() => platform.value && has('identity_accounts_manage')),
  existing = computed(() => [
    ...new Set([
      ...(page.value?.items ?? []).flatMap((r) =>
        r.value?.subject.kind === 'user' ? [r.value.subject.user.principalId] : [],
      ),
      ...(effective.value?.grants ?? []).flatMap((g) =>
        g.subject.kind === 'user' ? [g.subject.user.principalId] : [],
      ),
    ]),
  ])
function principalLabel(value: Rule['subject']) {
  const principal = value.kind === 'user' ? value.user.principalId : value.id
  return accounts.value.find((a) => a.principalId === principal)?.login || principal
}
function clearDraft() {
  id.value = crypto.randomUUID()
  revision.value = 0
  kind.value = 'user'
  subjectId.value = ''
  provider.value = ''
  issuer.value = ''
  configurationVersion.value = 1
  matching.value = 'exact'
  grants.value = []
  baseline.value = null
  preview.value = undefined
  remote.value = undefined
  selectedDeleted.value = false
}
function clearFacts() {
  page.value = undefined
  effective.value = undefined
  pageIndex.value = 0
  cursors.value = [undefined]
  editorOpen.value = false
  accounts.value = []
  accountCursor.value = null
  accountsRead.value = false
  directoryDenied.value = false
  clearDraft()
}
function intentDocument(value: unknown) {
  if (typeof value !== 'string' || new TextEncoder().encode(value).length > 2 * 1024 * 1024)
    throw new Error('Invalid authorization intent')
  return JSON.parse(value) as unknown
}
function frozen() {
  if (!pending.value) throw new Error('No original operation')
  const v = closed(JSON.parse(pending.value.publicInput), ['ruleId', 'definition', 'basis']),
    target = uuid(v['ruleId']),
    value: unknown = intentDocument(v['definition'])
  const basis: unknown = intentDocument(v['basis'])
  return {
    target,
    value: value === null ? null : ruleForRealm(value, runtime.tenant, runtime.realm),
    basis: basis === null ? null : ruleForRealm(basis, runtime.tenant, runtime.realm),
    expectedRevision: pending.value.expectedRevision,
  }
}
function fill(value: Rule | null, target: string, rev: number) {
  clearDraft()
  id.value = target
  revision.value = rev
  baseline.value = value ? structuredClone(toRaw(value)) : null
  if (!value) {
    selectedDeleted.value = true
    return
  }
  kind.value = value.subject.kind
  subjectId.value =
    value.subject.kind === 'user' ? value.subject.user.principalId : value.subject.id
  grants.value = structuredClone(toRaw(value.grants))
  if (value.subject.kind === 'department' || value.subject.kind === 'idp_group') {
    provider.value = value.subject.source.providerId
    issuer.value = value.subject.source.issuer
    configurationVersion.value = value.subject.source.configurationVersion
    if (value.subject.kind === 'department') matching.value = value.subject.matching
  }
}
function restoreOriginal() {
  try {
    const original = frozen()
    fill(original.value, original.target, original.expectedRevision)
    baseline.value = original.basis
    selectedDeleted.value = false
    preview.value = original.value === null ? 'delete' : 'save'
    editorOpen.value = true
  } catch {
    failure.value = 'invalidResponse'
  }
}
function create() {
  if (busy.value || locked.value || !canWrite.value) return
  clearDraft()
  editorOpen.value = true
}
async function select(row: Revision<Rule>) {
  if (busy.value || locked.value || !canRead.value) return
  clearDraft()
  editorOpen.value = false
  await run(
    () => client.rule(row.id),
    (detail) => {
      fill(detail.value, detail.id, detail.revision)
      editorOpen.value = true
    },
  )
}
async function load(after: string | undefined, index: number) {
  if (!bound.value || busy.value || !canRead.value) return false
  page.value = undefined
  return run(
    () => client.rules({ cursor: after }),
    (v) => {
      page.value = v
      pageIndex.value = index
      cursors.value = [...cursors.value.slice(0, index), after]
    },
  )
}
async function next() {
  if (page.value?.nextCursor && !busy.value) await load(page.value.nextCursor, pageIndex.value + 1)
}
async function previous() {
  if (pageIndex.value > 0 && !busy.value)
    await load(cursors.value[pageIndex.value - 1], pageIndex.value - 1)
}
async function loadAccounts(more = false) {
  if (!canBrowse.value || busy.value) return
  const cursor = more ? (accountCursor.value ?? undefined) : undefined
  if (!more) {
    accounts.value = []
    accountsRead.value = false
    accountCursor.value = null
  }
  directoryDenied.value = false
  await run(
    async () => {
      try {
        const page = await identity.api.accounts(cursor)
        if (page.next !== null && page.next === cursor) throw new Error('Repeated account cursor')
        return { page, denied: false }
      } catch (error) {
        if (isRssApiError(error) && error.status === 403) return { page: null, denied: true }
        throw error
      }
    },
    (result) => {
      directoryDenied.value = result.denied
      if (result.denied) {
        accounts.value = []
        accountsRead.value = false
        accountCursor.value = null
      }
      if (result.page) {
        accounts.value = [
          ...new Map(
            [...(more ? accounts.value : []), ...result.page.accounts].map((a) => [
              a.principalId,
              a,
            ]),
          ).values(),
        ]
        accountCursor.value = result.page.next
        accountsRead.value = true
      }
    },
  )
}
function definition(): Rule {
  if (!effective.value || !bound.value) throw new Error('No current binding')
  const subject =
    kind.value === 'user'
      ? {
          kind: 'user',
          user: {
            instanceId: effective.value.instanceId,
            tenantId: runtime.tenant,
            principalId: subjectId.value,
          },
        }
      : kind.value === 'user_group'
        ? { kind: 'user_group', id: subjectId.value }
        : {
            kind: kind.value,
            id: subjectId.value,
            source: {
              providerId: provider.value,
              issuer: issuer.value,
              configurationVersion: configurationVersion.value,
            },
            ...(kind.value === 'department' ? { matching: matching.value } : {}),
          }
  return ruleForRealm({ subject, grants: grants.value }, runtime.tenant, runtime.realm)
}
function review(action: 'save' | 'delete') {
  if (busy.value || locked.value || !canWrite.value || selectedDeleted.value) return
  try {
    if (action === 'save') definition()
    else if (revision.value === 0) return
    preview.value = action
    failure.value = null
  } catch {
    failure.value = 'invalidRequest'
  }
}
const intentTarget = computed(() => {
  try {
    return frozen().target
  } catch {
    return '—'
  }
})
const proposed = computed(() =>
    preview.value === 'delete'
      ? null
      : (() => {
          try {
            return definition()
          } catch {
            return null
          }
        })(),
  ),
  additions = computed(
    () =>
      proposed.value?.grants.filter(
        (g) => !baseline.value?.grants.some((old) => JSON.stringify(g) === JSON.stringify(old)),
      ) ?? [],
  ),
  removals = computed(
    () =>
      baseline.value?.grants.filter(
        (g) => !proposed.value?.grants.some((next) => JSON.stringify(g) === JSON.stringify(next)),
      ) ?? [],
  ),
  subjectChanged = computed(
    () =>
      !!baseline.value &&
      !!proposed.value &&
      JSON.stringify(baseline.value.subject) !== JSON.stringify(proposed.value.subject),
  )
watch(
  () =>
    JSON.stringify([
      kind.value,
      subjectId.value,
      provider.value,
      issuer.value,
      configurationVersion.value,
      matching.value,
      grants.value,
    ]),
  () => {
    if (!locked.value) preview.value = undefined
  },
  { flush: 'sync' },
)
async function save(replay = false) {
  if (!canWrite.value || busy.value || (!replay && !preview.value)) return
  let original: ReturnType<typeof frozen>
  try {
    original = replay
      ? frozen()
      : {
          target: uuid(id.value),
          expectedRevision: revision.value,
          value: preview.value === 'delete' ? null : definition(),
          basis: baseline.value,
        }
  } catch {
    failure.value = 'invalidRequest'
    return
  }
  const metadata = {
    ruleId: original.target,
    definition: JSON.stringify(original.value),
    basis: JSON.stringify(original.basis),
  }
  const ok = await submit(
    'rule',
    original.expectedRevision,
    metadata,
    (operationId) =>
      client.changeRule(original.target, {
        operationId,
        expectedRevision: original.expectedRevision,
        value: original.value,
      }),
    (v) => {
      fill(original.value, original.target, v.revision)
      selectedDeleted.value = v.deleted
      preview.value = undefined
    },
    replay,
  )
  if (ok) await load(cursors.value[pageIndex.value], pageIndex.value)
}
async function compare() {
  if (!canRead.value || busy.value) return
  const target =
      pending.value && (pending.value.state === 'unknown' || pending.value.state === 'conflict')
        ? frozen().target
        : id.value,
    operation = pending.value?.id
  remote.value = undefined
  await run(
    async () => {
      try {
        return await client.rule(target)
      } catch (error) {
        if (isRssApiError(error) && error.status === 404) return null
        throw error
      }
    },
    (v) => {
      remote.value = v
      markCompared()
      if (operation) runtime.settings.operations.queried(key, operation)
    },
  )
}
function adopt() {
  if (
    pending.value?.state !== 'conflict' ||
    !compared.value ||
    !remote.value?.value ||
    !canWrite.value
  )
    return
  const current = remote.value
  resolveConflict()
  revision.value = current.revision
  baseline.value = structuredClone(toRaw(current.value))
  preview.value = undefined
  remote.value = undefined
  failure.value = null
}
function freshAfterDelete() {
  if (
    pending.value?.state !== 'conflict' ||
    !compared.value ||
    remote.value?.value ||
    !canWrite.value
  )
    return
  resolveConflict()
  create()
}
async function routeTarget() {
  if (!bound.value || !canRead.value) return
  if (pending.value && ['unknown', 'conflict', 'submitting'].includes(pending.value.state)) {
    restoreOriginal()
    return
  }
  const target = route.query['id']
  if (typeof target !== 'string') return
  await run(
    () => client.rule(target),
    (v) => {
      if (v) {
        fill(v.value, v.id, v.revision)
        editorOpen.value = true
      } else {
        clearDraft()
        failure.value = 'notFound'
      }
    },
  )
}
async function initialize() {
  if (!bound.value || busy.value) return
  clearFacts()
  const principal = runtime.session.state.value.identity?.principalId
  const ok = await run(
    async () => {
      const v = await client.effective()
      if (v.principalId !== principal) throw new Error('Wrong actor')
      return v
    },
    (v) => {
      effective.value = v
    },
  )
  if (!ok) return
  if (canRead.value) await load(undefined, 0)
  await routeTarget()
}
useSettingsFacts(clearFacts)
watch(
  () => [
    runtime.session.state.value.status,
    runtime.session.state.value.tenant,
    runtime.session.state.value.identity?.principalId,
    runtime.session.state.value.session?.id,
  ],
  () => {
    if (bound.value) void initialize()
  },
  { flush: 'post' },
)
watch(
  () => route.params['tenant'],
  () => {
    clearFacts()
    if (bound.value) void initialize()
  },
  { flush: 'post' },
)
watch(
  () => route.query['id'],
  () => {
    void routeTarget()
  },
  { flush: 'post' },
)
onMounted(initialize)
</script>
<template>
  <MdmPage
    :title="t(platform ? 'operations.ruleUi.platformTitle' : 'operations.authorization')"
    :busy="busy"
    :failure="failure"
  >
    <template #actions
      ><VBtn :disabled="busy || !bound" @click="initialize">{{ t('devices.reload') }}</VBtn
      ><VBtn color="primary" :disabled="locked || !canWrite" @click="create">{{
        t('operations.ruleUi.new')
      }}</VBtn></template
    >
    <VAlert v-if="platform" type="info" :title="t('operations.ruleUi.realmTitle')"
      ><p>{{ t('operations.ruleUi.realmHint') }}</p>
      <p>
        {{ t('operations.ruleUi.tenantLabel') }} · <code>{{ runtime.tenant }}</code>
      </p>
      <a href="/login">{{ t('operations.ruleUi.businessExit') }}</a></VAlert
    >
    <p v-else>{{ t('operations.authorityWarning') }}</p>
    <VExpansionPanels v-if="platform" class="console-panel"
      ><VExpansionPanel>
        <VExpansionPanelTitle>{{ t('operations.ruleUi.initialProtection') }}</VExpansionPanelTitle
        ><VExpansionPanelText>
          <p>{{ t('operations.ruleUi.initialUnknown') }}</p>
        </VExpansionPanelText></VExpansionPanel
      ></VExpansionPanels
    >
    <p v-if="effective && !canWrite">{{ t('operations.ruleUi.readonly') }}</p>
    <section v-if="bound && pending" class="console-panel" aria-live="polite">
      <p>
        {{
          t(
            pending.state === 'unknown'
              ? 'operations.ruleUi.unknown'
              : pending.state === 'conflict'
                ? 'operations.ruleUi.conflict'
                : pending.state === 'submitting'
                  ? 'operations.ruleUi.submitting'
                  : 'operations.ruleUi.received',
          )
        }}
      </p>
      <VExpansionPanels
        ><VExpansionPanel>
          <VExpansionPanelTitle>{{ t('operations.ruleUi.technical') }}</VExpansionPanelTitle
          ><VExpansionPanelText>
            <p>
              {{ t('operations.ruleUi.originalOperation') }} · <code>{{ pending.id }}</code>
            </p>
            <p>
              {{ t('operations.ruleUi.originalTarget') }} · <code>{{ intentTarget }}</code>
            </p>
          </VExpansionPanelText></VExpansionPanel
        ></VExpansionPanels
      >
      <VBtn
        v-if="pending.state === 'unknown' || pending.state === 'conflict'"
        :disabled="busy"
        @click="restoreOriginal"
        >{{ t('operations.ruleUi.resume') }}</VBtn
      >
    </section>
    <VDataTable
      disable-sort
      hide-default-footer
      :items-per-page="-1"
      :aria-label="t('operations.ruleUi.table')"
      :items="bound ? (page?.items ?? []) : []"
      :headers="[
        { key: 'subject', title: t('operations.ruleUi.subject') },
        { key: 'grants', title: t('operations.ruleUi.permissionsLabel') },
        { key: 'revision', title: t('operations.ruleUi.revision') },
        { key: 'state', title: t('operations.ruleUi.status') },
      ]"
      :item-value="(r) => r.id"
      :loading="busy"
      :loading-text="t('devices.loading')"
      :no-data-text="t('operations.ruleUi.empty')"
    >
      <template #[`item.subject`]="{ item: row }"
        ><VBtn :disabled="busy || locked" variant="text" @click="select(row)">{{
          row.value ? principalLabel(row.value.subject) : row.id
        }}</VBtn
        ><small v-if="row.value" class="ui-help">{{ row.value.subject.kind }}</small></template
      >
      <template #[`item.grants`]="{ item: row }"
        ><GrantFacts v-if="row.value" :grants="row.value.grants" /><span v-else>—</span></template
      >
      <template #[`item.revision`]="{ item: row }">r{{ row.revision }}</template>
      <template #[`item.state`]="{ item: row }"
        ><VChip :color="row.value ? 'secondary' : 'warning'">{{
          t(row.value ? 'operations.ruleUi.active' : 'operations.ruleUi.deleted')
        }}</VChip></template
      >
    </VDataTable>
    <div class="settings-actions">
      <span>{{ t('operations.ruleUi.page') }} {{ pageIndex + 1 }}</span
      ><VBtn :disabled="busy || pageIndex === 0" @click="previous">{{
        t('operations.ruleUi.previous')
      }}</VBtn
      ><VBtn :disabled="busy || !page?.nextCursor" @click="next">{{
        t('operations.ruleUi.next')
      }}</VBtn>
    </div>
    <VExpansionPanels v-if="bound && effective" class="console-panel"
      ><VExpansionPanel>
        <VExpansionPanelTitle>{{ t('operations.ruleUi.effectiveTitle') }}</VExpansionPanelTitle
        ><VExpansionPanelText>
          <p>{{ t('operations.ruleUi.effectiveHint') }}</p>
          <GrantFacts :grants="effective.grants" /> </VExpansionPanelText></VExpansionPanel
    ></VExpansionPanels>
  </MdmPage>
  <OperationDialog
    :open="bound && editorOpen"
    placement="right"
    :dismissible="!busy"
    :title="t('operations.ruleUi.editorTitle')"
    :close-label="t('operations.ruleUi.close')"
    @update:open="editorOpen = $event"
  >
    <p>{{ t(platform ? 'operations.ruleUi.scopeHint' : 'operations.authorityWarning') }}</p>
    <p>
      {{ t(revision ? 'operations.ruleUi.existingDraft' : 'operations.ruleUi.newDraft') }} · r{{
        revision
      }}
    </p>
    <p v-if="selectedDeleted">{{ t('operations.ruleUi.deleted') }}</p>
    <VForm
      v-if="!preview && !selectedDeleted"
      :disabled="locked || !canWrite || !effective"
      class="settings-form"
      @submit.prevent="($event.target as HTMLFormElement).reportValidity() &amp;&amp; (review('save'))"
    >
      <fieldset :disabled="locked || !canWrite || !effective">
        <PrincipalChoice
          v-if="platform"
          v-model="subjectId"
          :accounts="accounts"
          :existing="existing"
          :can-browse="canBrowse"
          :loaded="accountsRead"
          :denied="directoryDenied"
          :more="!!accountCursor"
          :busy="busy"
          @load="loadAccounts()"
          @more="loadAccounts(true)"
        />
        <template v-else
          ><VSelect
            v-model="kind"
            :items="[
              ...['user', 'user_group', 'department', 'idp_group'].map((value) => ({
                title: value,
                value: value,
              })),
            ]"
            :label="t('operations.subject')"
          /><VTextField
            v-model="subjectId"
            data-testid="subject-id"
            :maxlength="kind === 'user' || kind === 'user_group' ? 36 : 256"
            required
            :label="t('operations.subjectId')"
          />
          <template v-if="kind === 'department' || kind === 'idp_group'"
            ><VTextField
              v-model="provider"
              maxlength="36"
              required
              :label="t('operations.provider')" /><VTextField
              v-model="issuer"
              maxlength="2048"
              required
              :label="t('operations.issuer')" /><VTextField
              v-model.number="configurationVersion"
              type="number"
              min="1"
              required
              :label="t('operations.sourceVersion')" /></template
          ><VSelect
            v-if="kind === 'department'"
            v-model="matching"
            :items="[
              { title: 'exact', value: 'exact' },
              { title: 'subtree', value: 'subtree' },
            ]"
            :label="t('operations.matching')"
          />
        </template>
        <PermissionChoices v-model="grants" :realm="runtime.realm" />
      </fieldset>
    </VForm>
    <section v-if="preview" class="console-panel">
      <h2>{{ t('operations.ruleUi.changeReview') }}</h2>
      <p v-if="preview === 'delete'">{{ t('operations.ruleUi.reviewDelete') }}</p>
      <p>
        {{ t('operations.ruleUi.subject') }} ·
        {{
          proposed
            ? principalLabel(proposed.subject)
            : baseline
              ? principalLabel(baseline.subject)
              : subjectId
        }}
      </p>
      <p v-if="subjectChanged && baseline && proposed">
        {{ t('operations.ruleUi.subjectChange') }}<br />{{ principalLabel(baseline.subject) }} →
        {{ principalLabel(proposed.subject) }}
      </p>
      <h3>{{ t('operations.ruleUi.added') }}</h3>
      <GrantFacts :grants="additions" />
      <h3>{{ t('operations.ruleUi.removed') }}</h3>
      <GrantFacts :grants="removals" />
      <p v-if="!additions.length && !removals.length">{{ t('operations.ruleUi.noChanges') }}</p>
    </section>
    <p v-if="failure" role="alert">
      {{ t(failure === 'denied' ? 'operations.ruleUi.protectionDenied' : 'devices.' + failure) }}
    </p>
    <template v-if="pending?.state === 'unknown' || pending?.state === 'conflict'">
      <p role="alert">
        {{
          t(
            pending.state === 'unknown'
              ? 'operations.ruleUi.unknown'
              : 'operations.ruleUi.conflict',
          )
        }}
      </p>
      <p>{{ t('operations.ruleUi.noOperationGet') }}</p>
      <VBtn :disabled="busy || !canRead" @click="compare">{{
        t('operations.ruleUi.readCurrent')
      }}</VBtn>
      <section v-if="baseline" class="console-panel">
        <h2>{{ t('operations.ruleUi.baseSnapshot') }}</h2>
        <p>{{ t('operations.ruleUi.subject') }} · {{ principalLabel(baseline.subject) }}</p>
        <GrantFacts :grants="baseline.grants" />
      </section>
      <section v-if="remote !== undefined" class="console-panel">
        <h2>{{ t('operations.ruleUi.current') }}</h2>
        <template v-if="remote"
          ><p>r{{ remote.revision }}</p>
          <template v-if="remote.value"
            ><p>
              {{ t('operations.ruleUi.subject') }} · {{ principalLabel(remote.value.subject) }}
            </p>
            <GrantFacts :grants="remote.value.grants"
          /></template>
          <p v-else>{{ t('operations.ruleUi.deletedCurrent') }}</p></template
        >
        <p v-else>{{ t('operations.ruleUi.missingCurrent') }}</p>
      </section>
      <VBtn
        v-if="pending.state === 'unknown'"
        data-testid="replay-write"
        :disabled="busy || !canWrite || !pending.queried"
        @click="save(true)"
        >{{ t('operations.ruleUi.replay') }}</VBtn
      >
      <VBtn
        v-if="pending.state === 'conflict' && remote?.value && compared"
        :disabled="busy || !canWrite"
        @click="adopt"
        >{{ t('operations.ruleUi.keepDraft') }}</VBtn
      ><VBtn
        v-if="pending.state === 'conflict' && remote !== undefined && !remote?.value && compared"
        :disabled="busy || !canWrite"
        @click="freshAfterDelete"
        >{{ t('operations.ruleUi.freshAfterDelete') }}</VBtn
      >
    </template>
    <VExpansionPanels
      ><VExpansionPanel>
        <VExpansionPanelTitle>{{ t('operations.ruleUi.technical') }}</VExpansionPanelTitle
        ><VExpansionPanelText>
          <p>
            {{ t('operations.ruleUi.originalTarget') }} · <code>{{ id }}</code>
          </p>
          <p>{{ t('operations.ruleUi.revision') }} · {{ revision }}</p>
        </VExpansionPanelText></VExpansionPanel
      ></VExpansionPanels
    >
    <template #footer
      ><VBtn v-if="preview" :disabled="locked || !canWrite" @click="preview = undefined">{{
        t('operations.ruleUi.editDraft')
      }}</VBtn
      ><VBtn
        v-if="!preview && !selectedDeleted"
        data-testid="review-rule"
        :disabled="locked || !canWrite"
        @click="review('save')"
        >{{ t('operations.ruleUi.review') }}</VBtn
      ><VBtn
        v-if="revision > 0 && !preview && !selectedDeleted"
        color="error"
        :disabled="locked || !canWrite"
        @click="review('delete')"
        >{{ t('operations.ruleUi.confirmDelete') }}</VBtn
      ><VBtn
        v-if="preview"
        data-testid="save-rule"
        :color="preview === 'delete' ? 'error' : 'primary'"
        :disabled="locked || !canWrite"
        @click="save()"
        >{{
          t(
            preview === 'delete'
              ? 'operations.ruleUi.confirmDelete'
              : 'operations.ruleUi.confirmSave',
          )
        }}</VBtn
      ></template
    >
  </OperationDialog>
</template>
