<script setup lang="ts">
import { VSelect, VBtn, VTextField, VCheckbox } from 'vuetify/components'

import { comparison as queryComparison } from '../../../services/directory-query'
import { onBeforeUnmount, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useMdm } from '../../../context'
import { operation, useOperation, type Operation } from '../../../services/useOperation'
import {
  defaultSchedule,
  policyDefinition,
  type PolicyRead,
  type PolicyChange,
} from '../../policies/clients/model'
import NativeScheduleEditor from '../../software/components/NativeScheduleEditor.vue'
import CatalogLocator from '../../policies/components/CatalogLocator.vue'
import AssignmentFacts from '../../policies/components/AssignmentFacts.vue'
import { objectKey } from '../../devices/clients/objects'
import { deviceBinding } from '../../devices/useDeviceBinding'
import MdmPage from '../../../ui/MdmPage.vue'
import PolicyIdentityEditor from '../../policies/components/PolicyIdentityEditor.vue'
import PolicyEntry from '../../policies/components/PolicyEntry.vue'
import PolicyDelete from '../../policies/components/PolicyDelete.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.policies.policies,
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const alias = ref<string | null>(null),
  customEvent = ref<string | null>(null)
const action = ref<'ensure_agent_installed' | 'request_mdm_enrollment'>('ensure_agent_installed'),
  id = ref(''),
  scope = ref(''),
  organization = ref(''),
  packages = ref<Record<string, string>>({}),
  schedule = ref(defaultSchedule()),
  lifetime = ref(1800),
  enabled = ref(true),
  editing = ref(false),
  current = ref<PolicyRead>(),
  page = ref<Awaited<ReturnType<typeof client.list>>>(),
  assignments = ref<Awaited<ReturnType<typeof client.assignments>>>(),
  records = ref<Awaited<ReturnType<typeof runtime.policies.executions.directory>>>(),
  releases = ref<Awaited<ReturnType<typeof runtime.onboarding.packages.list>>>([])
let pending: { id: string; body: Operation<PolicyChange> } | undefined
onBeforeUnmount(() => {
  pending = undefined
})
const targets = ['windows_x86_64', 'windows_aarch64', 'macos_x86_64', 'macos_aarch64'] as const
function apply(p: PolicyRead) {
  const a = p.definition.action
  if (a.kind !== 'ensure_agent_installed' && a.kind !== 'request_mdm_enrollment')
    throw new Error('Wrong onboarding action')
  alias.value = p.definition.alias
  customEvent.value = p.definition.customEvent
  current.value = p
  id.value = p.id
  action.value = a.kind
  scope.value = p.definition.scope
  enabled.value = p.enabled
  schedule.value = structuredClone(a.schedule)
  lifetime.value = a.runLifetimeSeconds
  packages.value = a.kind === 'ensure_agent_installed' ? { ...a.packages } : {}
  organization.value = a.kind === 'request_mdm_enrollment' ? a.organization : ''
  editing.value = false
  assignments.value = undefined
  records.value = undefined
}
function list(cursor?: string) {
  void run(
    () => client.list({ cursor, filter: queryComparison('action', '==', action.value) }),
    (v) => {
      page.value = v
    },
  )
}
function read(target = id.value) {
  if (busy.value || uncertain.value) return
  void run(() => client.read(target), apply)
}
function create() {
  if (busy.value || uncertain.value) return
  current.value = undefined
  id.value = crypto.randomUUID()
  scope.value = ''
  alias.value = null
  customEvent.value = null
  packages.value = {}
  organization.value = ''
  schedule.value = defaultSchedule()
  enabled.value = true
  assignments.value = undefined
  editing.value = true
}
function replay() {
  const original = pending
  if (!original || busy.value) return
  void runWrite(
    () => client.change(original.id, structuredClone(toRaw(original.body))),
    (p) => {
      pending = undefined
      apply(p)
      if (p.state === 'archived' && page.value)
        page.value.items = page.value.items.filter((item) => item.id !== p.id)
      else page.value = undefined
    },
  )
}
function write(input: PolicyChange) {
  if (
    busy.value ||
    uncertain.value ||
    current.value?.state === 'archived' ||
    (input.action === 'archive' && current.value?.state !== 'disabled')
  )
    return
  pending = {
    id: current.value?.id ?? id.value,
    body: operation(input, current.value?.revision ?? 0),
  }
  replay()
}
function save() {
  try {
    const base = { schedule: schedule.value, runLifetimeSeconds: lifetime.value },
      input =
        action.value === 'ensure_agent_installed'
          ? {
              kind: action.value,
              packages: Object.fromEntries(Object.entries(packages.value).filter(([, id]) => id)),
              ...base,
            }
          : { kind: action.value, organization: organization.value, ...base }
    write({
      action: 'put',
      enabled: enabled.value,
      definition: policyDefinition({
        ...current.value?.definition,
        customEvent: customEvent.value,
        scope: scope.value,
        alias: alias.value,
        action: input,
      }),
    })
  } catch {
    failure.value = 'invalidRequest'
  }
}
function progress(after?: string) {
  assignments.value = undefined
  const target = current.value?.id
  if (target)
    void run(
      () => client.assignments(target, { cursor: after }),
      (v) => {
        if (current.value?.id === target) assignments.value = v
      },
    )
}
function executions(cursor?: string) {
  const policy = current.value?.id
  if (!policy) return
  void run(
    () =>
      runtime.policies.executions.directory({
        filter: queryComparison('policy', '==', policy),
        cursor,
      }),
    (v) => {
      records.value = v
    },
  )
}
function loadReleases() {
  void run(
    () => runtime.onboarding.packages.list(),
    (v) => {
      releases.value = v
    },
  )
}
watch(
  () => route.fullPath,
  () => {
    pending = undefined
    current.value = undefined
    page.value = undefined
    assignments.value = undefined
    records.value = undefined
    editing.value = false
    id.value = ''
    scope.value = ''
    packages.value = {}
    organization.value = ''
    const target = route.query['id']
    if (typeof target === 'string') read(target)
    else if (route.query['create'] === '1') {
      action.value =
        route.query['action'] === 'request_mdm_enrollment'
          ? 'request_mdm_enrollment'
          : 'ensure_agent_installed'
      create()
    } else list()
  },
  { immediate: true },
)
watch(action, () => {
  page.value = undefined
  assignments.value = undefined
  records.value = undefined
})
watch(
  () => deviceBinding(runtime),
  () => {
    pending = undefined
    current.value = undefined
    assignments.value = undefined
    records.value = undefined
    page.value = undefined
    editing.value = false
    id.value = ''
    scope.value = ''
    packages.value = {}
    organization.value = ''
  },
  { flush: 'sync' },
)
</script>
<template>
  <MdmPage :title="t('software.bootstrap')" :busy="busy" :failure="failure"
    ><p>{{ t('software.bootstrapPolicyHint') }}</p>
    <label
      >{{ t('policies.kind')
      }}<VSelect
        v-model="action"
        :disabled="busy || uncertain || !!current"
        :items="[
          { title: String(t('software.installAgent')), value: 'ensure_agent_installed' },
          { title: String(t('software.requestMdm')), value: 'request_mdm_enrollment' },
        ]"
        variant="outlined"
        density="comfortable"
        hide-details="auto" /></label
    ><VBtn :disabled="busy || uncertain" @click="create">{{ t('policies.create') }}</VBtn
    ><VBtn :disabled="busy" @click="list()">{{ t('policies.reload') }}</VBtn>
    <ul class="console-object-list">
      <li v-for="item in page?.items" :key="item.id">
        <VBtn :disabled="busy || uncertain" @click="read(item.id)">{{ item.id }}</VBtn>
      </li>
    </ul>
    <VBtn v-if="page?.nextCursor" :disabled="busy" @click="list(page.nextCursor)">{{
      t('devices.next')
    }}</VBtn>
    <section v-if="current" class="console-panel">
      <h2 data-testid="onboarding-policy-locator">{{ current.id }} · {{ current.revision }}</h2>
      <p>
        {{ current.definition.scope }} ·
        {{
          t(
            current.state === 'archived'
              ? 'policies.state.archived'
              : current.enabled
                ? 'policies.state.active'
                : 'policies.state.paused',
          )
        }}
      </p>
      <p v-if="current.state === 'archived'" role="status">{{ t('policies.archivedHint') }}</p>
      <VBtn
        v-if="current.state !== 'archived'"
        :disabled="busy || uncertain"
        @click="editing = true"
        >{{ t('console.edit') }}</VBtn
      ><VBtn
        v-if="current.state !== 'archived'"
        :disabled="busy || uncertain"
        @click="write({ action: current.enabled ? 'disable' : 'enable' })"
        >{{ t(current.enabled ? 'software.disable' : 'software.enable') }}</VBtn
      ><VBtn :disabled="busy" @click="progress()">{{ t('policies.refreshProgress') }}</VBtn>
      <VBtn :disabled="busy" @click="executions()">{{ t('policies.executions') }}</VBtn>
    </section>
    <PolicyEntry v-if="current" :policy="current" />
    <p v-if="uncertain && pending" role="alert">
      {{ t('policies.selfService.unknown', { id: pending.body.operationId }) }}
    </p>
    <VBtn v-if="uncertain && pending" :disabled="busy" @click="replay">{{
      t('policies.selfService.recover')
    }}</VBtn>
    <PolicyDelete
      v-if="current"
      :policy="current"
      :disabled="busy || uncertain"
      @confirm="write({ action: 'archive' })"
    />
    <form
      v-if="editing && current?.state !== 'archived'"
      class="console-panel"
      @submit.prevent="save"
    >
      <fieldset :disabled="busy || uncertain">
        <PolicyIdentityEditor v-model:alias="alias" v-model:event="customEvent" />
        <label for="onboarding-scope"
          >{{ t('policies.scope')
          }}<VTextField
            id="onboarding-scope"
            v-model="scope"
            required
            variant="outlined"
            density="comfortable"
            hide-details="auto" /></label
        ><CatalogLocator
          v-model="scope"
          collection="scopes"
          :disabled="busy || uncertain"
        /><template v-if="action === 'ensure_agent_installed'"
          ><VBtn @click="loadReleases">{{ t('software.agentReleases') }}</VBtn
          ><label v-for="target in targets" :key="target"
            >{{ target
            }}<VSelect
              :model-value="packages[target] ?? ''" @update:model-value="packages[target] = $event"
              :items="[
                { title: String(t('devices.select')), value: '' },
                ...(packages[target] && !releases.some((r) => r.releaseId === packages[target])
                  ? [{ title: String(packages[target]), value: packages[target] }]
                  : []),
                ...releases
                  .filter((r) => `${r.target.platform}_${r.target.architecture}` === target)
                  .map((release) => ({
                    title:
                      String(release.version) +
                      '·' +
                      String(release.format) +
                      '·' +
                      String(release.releaseId),
                    value: release.releaseId,
                  })),
              ]"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
          /></label>
          <p>{{ t('software.releaseRequired') }}</p></template
        ><label v-else for="onboarding-organization"
          >{{ t('software.organization')
          }}<VTextField
            id="onboarding-organization"
            v-model="organization"
            required
            variant="outlined"
            density="comfortable"
            hide-details="auto" /></label
        ><NativeScheduleEditor v-model="schedule" :disabled="busy || uncertain" /><label
          >{{ t('software.runLifetime')
          }}<VTextField
            v-model.number="lifetime"
            type="number"
            min="60"
            max="604800"
            required
            variant="outlined"
            density="comfortable"
            hide-details="auto" /></label
        ><label
          ><VCheckbox v-model="enabled" hide-details="auto" />{{ t('policies.enabled') }}</label
        ><VBtn type="submit">{{ t('policies.save') }}</VBtn>
      </fieldset>
    </form>
    <section v-if="assignments" class="console-panel">
      <ul>
        <li v-for="item in assignments.items" :key="objectKey(item.object)">
          <AssignmentFacts :item="item" />
          <p>{{ item.qualification.state }}</p>
          <ul>
            <li v-for="operationId in item.operationIds" :key="operationId">
              {{ operationId }}
            </li>
          </ul>
        </li>
      </ul>
      <VBtn
        v-if="assignments.nextCursor"
        :disabled="busy"
        @click="progress(assignments.nextCursor)"
        >{{ t('devices.next') }}</VBtn
      >
    </section>
    <section v-if="records" class="console-panel">
      <p>{{ t('console.pageNotTotal') }}</p>
      <ul>
        <li v-for="record in records.items" :key="record.id">
          <RouterLink
            :to="{
              name: 'policy-execution',
              params: { tenant: runtime.tenant, execution: record.id },
              query:
                record.kind === 'command' ? { device: record.device } : { policy: record.policy },
            }"
            >{{ record.device }} · {{ record.id }} · {{ record.status }}</RouterLink
          >
          <p>{{ record.registrationId }} / {{ record.generation }}</p>
        </li>
      </ul>
      <VBtn v-if="records.nextCursor" :disabled="busy" @click="executions(records.nextCursor)">{{
        t('devices.next')
      }}</VBtn>
    </section>
  </MdmPage>
</template>
