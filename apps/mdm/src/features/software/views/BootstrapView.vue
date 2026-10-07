<script setup lang="ts">
import { ref, toRaw, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation, type Operation } from '../../../services/useOperation'
import {
  bootstrapDefinition,
  type BootstrapDefinition,
  type BootstrapPolicy,
  type BootstrapChange,
} from '../clients/bootstrap'
import SoftwareFrame from '../components/SoftwareFrame.vue'
import BootstrapAttemptFacts from '../components/BootstrapAttemptFacts.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.software.bootstrap
const { run, runWrite, busy, uncertain, failure } = useOperation()
const page = ref<Awaited<ReturnType<typeof client.list>>>(),
  selected = ref<BootstrapPolicy>(),
  invalid = ref(false)
function fresh(): BootstrapDefinition {
  return {
    title: '',
    scope: '',
    platform: 'windows',
    enabled: true,
    action: {
      kind: 'install_agent',
      resource: { kind: 'software', id: '', version: '1', variants: {} },
      admissionOperation: '',
      userAction: 'required',
    },
  }
}
const draft = ref(fresh())
let pending: { id: string; body: Operation<BootstrapChange> } | undefined
function accept(v: BootstrapPolicy) {
  selected.value = v
  draft.value = structuredClone(v.definition)
  if (pending?.id === v.id && pending.body.operationId === v.operation) uncertain.value = false
}
function read(id = uncertain.value ? pending?.id : selected.value?.id) {
  if (!id || (uncertain.value && pending?.id !== id)) return
  void run(() => client.read(id), accept)
}
function list(cursor?: string) {
  void run(
    () => client.list(cursor),
    (v) => {
      page.value = v
    },
  )
}
function create() {
  if (busy.value || uncertain.value) return
  selected.value = undefined
  pending = undefined
  draft.value = fresh()
}
function kind(event: Event) {
  draft.value.action =
    (event.target as HTMLSelectElement).value === 'install_agent'
      ? fresh().action
      : { kind: 'request_mdm', instructions: '' }
}
function resetBinding() {
  if (draft.value.action.kind === 'install_agent') {
    draft.value.action.admissionOperation = ''
    draft.value.action.resource.variants = {}
  }
}
function bind() {
  const a = draft.value.action
  if (a.kind !== 'install_agent') return
  const { id, version } = a.resource
  void run(
    async () => {
      const [r, approval] = await Promise.all([
        runtime.policies.resources.read(id),
        runtime.software.admission.version(id, version),
      ])
      const v = r.versions.find((v) => v.id === version)
      if (
        r.kind !== 'software' ||
        v?.state !== 'active' ||
        approval.admission?.state !== 'approved'
      )
        throw new Error('Unapproved Agent package')
      const variants: Record<string, string> = {}
      for (const variant of v.variants) {
        const target = `${variant.platform}_${variant.architecture}`
        if (variants[target]) throw new Error('Ambiguous Agent variant')
        variants[target] = variant.key
      }
      return {
        resource: { kind: 'software' as const, id, version, variants },
        admissionOperation: approval.admission.operation,
      }
    },
    (v) => {
      if (draft.value.action.kind === 'install_agent') Object.assign(draft.value.action, v)
    },
  )
}
async function replay() {
  if (pending) await runWrite(() => client.change(pending!.id, pending!.body), accept)
}
function change(input: BootstrapChange) {
  if (busy.value || uncertain.value) return
  invalid.value = false
  try {
    if (input.action === 'put')
      input = {
        action: 'put',
        definition: bootstrapDefinition(structuredClone(toRaw(input.definition))),
      }
  } catch {
    invalid.value = true
    return
  }
  pending = {
    id: selected.value?.id ?? crypto.randomUUID(),
    body: operation(input, selected.value?.revision ?? 0),
  }
  void replay()
}
watch(
  () => route.fullPath,
  () => {
    selected.value = undefined
    pending = undefined
    draft.value = fresh()
    invalid.value = false
    page.value = undefined
    const id = route.query['id']
    void run(
      () => Promise.all([client.list(), typeof id === 'string' ? client.read(id) : undefined]),
      ([items, value]) => {
        page.value = items
        if (value) accept(value)
      },
    )
  },
  { immediate: true },
)
</script>
<template>
  <SoftwareFrame :title="t('software.bootstrap')" :busy="busy" :failure="failure">
    <p>{{ t('software.bootstrapHint') }}</p>
    <button :disabled="busy" @click="list()">{{ t('policies.reload') }}</button
    ><button :disabled="busy || uncertain" @click="create">
      {{ t('software.newSourcePolicy') }}
    </button>
    <p v-if="page && !page.items.length">{{ t('policies.empty') }}</p>
    <ul>
      <li v-for="item in page?.items" :key="item.id">
        <button
          data-action="open-source-policy"
          :disabled="busy || uncertain"
          @click="read(item.id)"
        >
          {{ item.definition.title }} ·
          {{ t(`software.sourceAction_${item.definition.action.kind}`) }} · {{ item.id }}
        </button>
      </li>
    </ul>
    <button v-if="page?.nextCursor" :disabled="busy" @click="list(page.nextCursor)">
      {{ t('policies.next') }}
    </button>
    <form @submit.prevent="change({ action: 'put', definition: draft })">
      <fieldset :disabled="busy || uncertain">
        <legend>{{ t('software.sourcePolicy') }}</legend>
        <label for="bootstrap-title">{{ t('software.displayTitle') }}</label
        ><input id="bootstrap-title" v-model="draft.title" required />
        <label for="bootstrap-scope">{{ t('software.updateScope') }}</label
        ><input id="bootstrap-scope" v-model="draft.scope" required />
        <label for="bootstrap-platform">{{ t('policies.platform') }}</label
        ><select id="bootstrap-platform" v-model="draft.platform">
          <option value="windows">Windows</option>
          <option value="macos">macOS</option>
        </select>
        <label for="bootstrap-kind">{{ t('software.sourceDirection') }}</label
        ><select id="bootstrap-kind" :value="draft.action.kind" @change="kind">
          <option value="install_agent">{{ t('software.sourceAction_install_agent') }}</option>
          <option value="request_mdm">{{ t('software.sourceAction_request_mdm') }}</option>
        </select>
        <template v-if="draft.action.kind === 'install_agent'">
          <p>{{ t('software.agentPackageHint') }}</p>
          <p v-if="runtime.demo">{{ t('software.demoAgentPackage') }}</p>
          <label for="bootstrap-resource">{{ t('software.patchResource') }}</label
          ><input
            id="bootstrap-resource"
            v-model="draft.action.resource.id"
            required
            @input="resetBinding"
          />
          <label for="bootstrap-version">{{ t('software.resourceVersion') }}</label
          ><input
            id="bootstrap-version"
            v-model="draft.action.resource.version"
            required
            @input="resetBinding"
          />
          <button type="button" @click="bind">{{ t('software.bindAgentPackage') }}</button>
          <p>{{ draft.action.admissionOperation || t('software.notAdmitted') }}</p>
          <label for="bootstrap-user">{{ t('software.localAction') }}</label
          ><select id="bootstrap-user" v-model="draft.action.userAction">
            <option value="required">{{ t('software.localConsent') }}</option>
            <option value="silent">{{ t('software.silentAgentInstall') }}</option>
          </select>
        </template>
        <template v-else
          ><label for="bootstrap-instructions">{{ t('software.enrollmentInstructions') }}</label
          ><textarea
            id="bootstrap-instructions"
            v-model="draft.action.instructions"
            required
            maxlength="4096"
          />
          <p>{{ t('software.instructionsHint') }}</p></template
        >
        <label><input v-model="draft.enabled" type="checkbox" />{{ t('policies.enabled') }}</label
        ><button type="submit">{{ t('policies.save') }}</button>
      </fieldset>
    </form>
    <p v-if="invalid" role="alert">{{ t('software.invalidSourcePolicy') }}</p>
    <p v-if="uncertain" role="alert">{{ t('software.sourceUnknown') }}</p>
    <button v-if="uncertain && pending" :disabled="busy" @click="replay">
      {{ t('policies.replay') }}</button
    ><button
      v-if="pending || selected"
      data-action="read-source-policy"
      :disabled="busy"
      @click="read()"
    >
      {{ t('policies.verify') }}
    </button>
    <section v-if="selected">
      <h2>{{ selected.definition.title }} · {{ selected.id }}</h2>
      <p>
        {{ t('policies.revision') }} {{ selected.revision }} · {{ t('policies.scopes') }}
        {{ selected.scopeRevision ?? '—' }}
      </p>
      <div class="device-actions">
        <button
          v-for="action in ['evaluate', 'dispatch', 'pause', 'resume'] as const"
          :key="action"
          :data-action="`source-${action}`"
          :disabled="busy || uncertain"
          @click="change({ action })"
        >
          {{ t(`software.sourceCommand_${action}`) }}
        </button>
      </div>
      <article v-for="row in selected.targets" :key="row.device">
        <h3>{{ row.device }} · {{ t(`software.bootstrapAdmission_${row.admission}`) }}</h3>
        <dl>
          <dt>{{ t('software.observedSource') }}</dt>
          <dd>
            {{ row.source?.source ?? '—' }} · {{ row.source?.registrationId ?? '—' }} /
            {{ row.source?.generation ?? '—' }}
          </dd>
          <dt>{{ t('software.targetRegistration') }}</dt>
          <dd>
            {{ row.target?.source ?? '—' }} · {{ row.target?.registrationId ?? '—' }} /
            {{ row.target?.generation ?? '—' }} · {{ row.target?.status ?? '—' }}
          </dd>
          <dt>{{ t('software.targetBinding') }}</dt>
          <dd>{{ t(`software.binding_${row.binding}`) }}</dd>
        </dl>
        <p>{{ t('software.bootstrapFactsHint') }}</p>
        <BootstrapAttemptFacts v-if="row.attempt" :attempt="row.attempt" />
        <RouterLink
          v-if="row.attempt"
          :to="{
            name: 'policy-execution',
            params: { tenant: runtime.tenant, execution: row.attempt.id },
          }"
          >{{ t('policies.detail') }}</RouterLink
        >
        <RouterLink
          :to="{
            name: 'device-detail',
            params: { tenant: runtime.tenant, device: row.device },
            query: { tab: 'credentials' },
          }"
          >{{ t('software.viewRegistrations') }}</RouterLink
        >
        <RouterLink
          :to="
            selected.definition.action.kind === 'install_agent'
              ? { name: 'agent-downloads' }
              : {
                  name: 'device-enroll',
                  params: { tenant: runtime.tenant },
                  query: {
                    device: row.device,
                    source:
                      selected.definition.platform === 'windows' ? 'mdm.windows' : 'mdm.apple',
                  },
                }
          "
          >{{ t('software.openEnrollmentOwner') }}</RouterLink
        >
        <button
          v-if="row.attempt && ['failed', 'cancelled'].includes(row.attempt.phase)"
          :disabled="busy || uncertain"
          @click="change({ action: 'retry', device: row.device })"
        >
          {{ t('software.sourceCommand_retry') }}
        </button>
        <button
          v-if="row.attempt?.phase === 'unknown'"
          :disabled="busy || uncertain"
          @click="change({ action: 'reconcile', device: row.device })"
        >
          {{ t('software.sourceCommand_reconcile') }}
        </button>
      </article>
    </section>
  </SoftwareFrame>
</template>
