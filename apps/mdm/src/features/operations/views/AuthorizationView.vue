<script setup lang="ts">
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useIdentity } from '@rss/auth'
import { UiButton, UiTable, UiDialog, UiMessage, UiBadge } from '@rss/core/components'
import { useMdm } from '../../../context'
import { uuid, closed, string } from '../../../services/decode'
import { useSettingsAction, useSettingsFacts } from '../../settings/useSettingsAction'
import {
  ruleForRealm,
  type Rule,
  type Grant,
  type Subject,
  type Revision,
} from '../clients/authorization'
import PageFrame from '../../../components/PageFrame.vue'
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
  accountsRead = ref(false)
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
  clearDraft()
}
function frozen() {
  if (!pending.value) throw new Error('No original operation')
  const v = closed(JSON.parse(pending.value.publicInput), ['ruleId', 'definition', 'basis']),
    target = uuid(v['ruleId']),
    value: unknown = JSON.parse(string(v['definition']))
  const basis: unknown = JSON.parse(string(v['basis']))
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
function select(row: Revision<Rule>) {
  if (busy.value || locked.value) return
  fill(row.value, row.id, row.revision)
  editorOpen.value = true
}
async function load(after: string | undefined, index: number) {
  if (!bound.value || busy.value || !canRead.value) return false
  page.value = undefined
  return run(
    () => client.rules(after),
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
  await run(
    async () => {
      const v = await identity.api.accounts(cursor)
      if (v.next !== null && v.next === cursor) throw new Error('Repeated account cursor')
      return v
    },
    (v) => {
      accounts.value = [
        ...new Map(
          [...(more ? accounts.value : []), ...v.accounts].map((a) => [a.principalId, a]),
        ).values(),
      ]
      accountCursor.value = v.next
      accountsRead.value = true
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
    () => client.findRule(target),
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
    () => client.findRule(target),
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
  if (!bound.value) return
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
  <PageFrame
    :title="t(platform ? 'operations.ruleUi.platformTitle' : 'operations.authorization')"
    :busy="busy"
    :failure="failure"
  >
    <template #actions
      ><UiButton :disabled="busy || !bound" @click="initialize">{{ t('devices.reload') }}</UiButton
      ><UiButton variant="primary" :disabled="locked || !canWrite" @click="create">{{
        t('operations.ruleUi.new')
      }}</UiButton></template
    >
    <UiMessage v-if="platform" tone="info" :title="t('operations.ruleUi.realmTitle')"
      ><p>{{ t('operations.ruleUi.realmHint') }}</p>
      <p>
        {{ t('operations.ruleUi.tenantLabel') }} · <code>{{ runtime.tenant }}</code>
      </p>
      <a href="/login">{{ t('operations.ruleUi.businessExit') }}</a></UiMessage
    >
    <p v-else>{{ t('operations.authorityWarning') }}</p>
    <details v-if="platform" class="console-panel">
      <summary>{{ t('operations.ruleUi.initialProtection') }}</summary>
      <p>{{ t('operations.ruleUi.initialUnknown') }}</p>
    </details>
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
      <details>
        <summary>{{ t('operations.ruleUi.technical') }}</summary>
        <p>
          {{ t('operations.ruleUi.originalOperation') }} · <code>{{ pending.id }}</code>
        </p>
        <p>{{ pending.publicInput }}</p>
      </details>
      <UiButton
        v-if="pending.state === 'unknown' || pending.state === 'conflict'"
        :disabled="busy"
        @click="restoreOriginal"
        >{{ t('operations.ruleUi.resume') }}</UiButton
      >
    </section>
    <UiTable
      :label="t('operations.ruleUi.table')"
      :rows="bound ? (page?.items ?? []) : []"
      :columns="[
        { key: 'subject', label: t('operations.ruleUi.subject') },
        { key: 'grants', label: t('operations.ruleUi.permissionsLabel') },
        { key: 'revision', label: t('operations.ruleUi.revision') },
        { key: 'state', label: t('operations.ruleUi.status') },
      ]"
      :row-key="(r) => r.id"
      :busy="busy"
      :busy-label="t('devices.loading')"
      :empty-label="t('operations.ruleUi.empty')"
    >
      <template #cell-subject="{ row }"
        ><UiButton :disabled="busy || locked" variant="ghost" @click="select(row)">{{
          row.value ? principalLabel(row.value.subject) : row.id
        }}</UiButton
        ><small v-if="row.value" class="ui-help">{{ row.value.subject.kind }}</small></template
      >
      <template #cell-grants="{ row }"
        ><GrantFacts v-if="row.value" :grants="row.value.grants" /><span v-else>—</span></template
      >
      <template #cell-revision="{ row }">r{{ row.revision }}</template>
      <template #cell-state="{ row }"
        ><UiBadge :tone="row.value ? 'neutral' : 'warning'">{{
          t(row.value ? 'operations.ruleUi.active' : 'operations.ruleUi.deleted')
        }}</UiBadge></template
      >
    </UiTable>
    <div class="settings-actions">
      <span>{{ t('operations.ruleUi.page') }} {{ pageIndex + 1 }}</span
      ><UiButton :disabled="busy || pageIndex === 0" @click="previous">{{
        t('operations.ruleUi.previous')
      }}</UiButton
      ><UiButton :disabled="busy || !page?.nextCursor" @click="next">{{
        t('operations.ruleUi.next')
      }}</UiButton>
    </div>
    <details v-if="bound && effective" class="console-panel">
      <summary>{{ t('operations.ruleUi.effectiveTitle') }}</summary>
      <p>{{ t('operations.ruleUi.effectiveHint') }}</p>
      <GrantFacts :grants="effective.grants" />
    </details>
  </PageFrame>
  <UiDialog
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
    <form
      v-if="!preview && !selectedDeleted"
      class="settings-form"
      @submit.prevent="review('save')"
    >
      <fieldset :disabled="locked || !canWrite || !effective">
        <PrincipalChoice
          v-if="platform"
          v-model="subjectId"
          :accounts="accounts"
          :existing="existing"
          :can-browse="canBrowse"
          :loaded="accountsRead"
          :more="!!accountCursor"
          :busy="busy"
          @load="loadAccounts()"
          @more="loadAccounts(true)"
        />
        <template v-else
          ><label
            >{{ t('operations.subject')
            }}<select v-model="kind">
              <option
                v-for="value in ['user', 'user_group', 'department', 'idp_group']"
                :key="value"
              >
                {{ value }}
              </option>
            </select></label
          ><label
            >{{ t('operations.subjectId')
            }}<input
              v-model="subjectId"
              data-testid="subject-id"
              :maxlength="kind === 'user' || kind === 'user_group' ? 36 : 256"
              required
          /></label>
          <template v-if="kind === 'department' || kind === 'idp_group'"
            ><label
              >{{ t('operations.provider')
              }}<input v-model="provider" maxlength="36" required /></label
            ><label
              >{{ t('operations.issuer')
              }}<input v-model="issuer" maxlength="2048" required /></label
            ><label
              >{{ t('operations.sourceVersion')
              }}<input
                v-model.number="configurationVersion"
                type="number"
                min="1"
                required /></label></template
          ><label v-if="kind === 'department'"
            >{{ t('operations.matching')
            }}<select v-model="matching">
              <option>exact</option>
              <option>subtree</option>
            </select></label
          >
        </template>
        <PermissionChoices v-model="grants" :realm="runtime.realm" />
      </fieldset>
    </form>
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
      <p v-if="subjectChanged">{{ t('operations.ruleUi.subjectChange') }}</p>
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
      <UiButton :disabled="busy || !canRead" @click="compare">{{
        t('operations.ruleUi.readCurrent')
      }}</UiButton>
      <section v-if="remote !== undefined" class="console-panel">
        <h2>{{ t('operations.ruleUi.current') }}</h2>
        <template v-if="remote"
          ><p>r{{ remote.revision }}</p>
          <GrantFacts v-if="remote.value" :grants="remote.value.grants" />
          <p v-else>{{ t('operations.ruleUi.deletedCurrent') }}</p></template
        >
        <p v-else>{{ t('operations.ruleUi.missingCurrent') }}</p>
      </section>
      <UiButton
        v-if="pending.state === 'unknown'"
        data-testid="replay-write"
        :disabled="busy || !canWrite || !pending.queried"
        @click="save(true)"
        >{{ t('operations.ruleUi.replay') }}</UiButton
      >
      <UiButton
        v-if="pending.state === 'conflict' && remote?.value && compared"
        :disabled="busy || !canWrite"
        @click="adopt"
        >{{ t('operations.ruleUi.keepDraft') }}</UiButton
      ><UiButton
        v-if="pending.state === 'conflict' && remote !== undefined && !remote?.value && compared"
        :disabled="busy || !canWrite"
        @click="freshAfterDelete"
        >{{ t('operations.ruleUi.freshAfterDelete') }}</UiButton
      >
    </template>
    <details>
      <summary>{{ t('operations.ruleUi.technical') }}</summary>
      <p>
        {{ t('operations.ruleUi.originalTarget') }} · <code>{{ id }}</code>
      </p>
      <p>{{ t('operations.ruleUi.revision') }} · {{ revision }}</p>
    </details>
    <template #footer
      ><UiButton v-if="preview" :disabled="locked || !canWrite" @click="preview = undefined">{{
        t('operations.ruleUi.editDraft')
      }}</UiButton
      ><UiButton
        v-if="!preview && !selectedDeleted"
        data-testid="review-rule"
        :disabled="locked || !canWrite"
        @click="review('save')"
        >{{ t('operations.ruleUi.review') }}</UiButton
      ><UiButton
        v-if="revision > 0 && !preview && !selectedDeleted"
        variant="danger"
        :disabled="locked || !canWrite"
        @click="review('delete')"
        >{{ t('operations.ruleUi.confirmDelete') }}</UiButton
      ><UiButton
        v-if="preview"
        data-testid="save-rule"
        :variant="preview === 'delete' ? 'danger' : 'primary'"
        :disabled="locked || !canWrite"
        @click="save()"
        >{{
          t(
            preview === 'delete'
              ? 'operations.ruleUi.confirmDelete'
              : 'operations.ruleUi.confirmSave',
          )
        }}</UiButton
      ></template
    >
  </UiDialog>
</template>
