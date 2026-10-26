<script setup lang="ts">
import { telemetryBytes } from '../../../contracts/collection/canonical'

import { comparison as queryComparison, allOf } from '../../../services/directory-query'
import { computed, ref, shallowRef, watch, toRaw } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { UiButton, UiDialog, UiMessage } from '@rss/core/components'
import PageFrame from '../../../components/PageFrame.vue'
import { useMdm } from '../../../context'
import { operation, useOperation, type Operation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { usePermission } from '../../enrollment/usePermission'
import { record } from '../../../services/decode'
import { telemetryProfile, type TelemetryProfile } from '../../policies/clients/telemetry-profile'
import type { ResourceRead, ResourceChange, Variant } from '../../policies/clients/resources'
import type { PolicyRead, PolicyChange, PolicyDefinition } from '../../policies/clients/model'
import type { FieldDefinition } from '../../devices/clients/assets'
import WriteRecovery from '../components/WriteRecovery.vue'
import '../telemetry.css'
const runtime = useMdm(),
  route = useRoute(),
  { t } = useI18n(),
  rc = runtime.policies.resources,
  pc = runtime.policies.policies
const { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const permission = usePermission('resource_read', 'resource_write'),
  canWrite = computed(() => permission.canWrite.value && permission.allows('policy_write'))
const list = ref<Awaited<ReturnType<typeof rc.list>>>(),
  fields = ref<FieldDefinition[]>([]),
  templates = ref<Awaited<ReturnType<typeof rc.list>>['items']>([]),
  templateAfter = ref<string | null>(null),
  templateKind = ref<'agent_collection' | 'script'>('agent_collection')
const open = ref(false),
  step = ref(0),
  id = ref(''),
  version = ref(''),
  revision = ref(0),
  scope = ref(''),
  policyId = ref(''),
  policy = ref<PolicyRead>(),
  scopeOptions = ref<Awaited<ReturnType<typeof runtime.policies.scopes.list>>>()
const templateId = ref(''),
  template = ref<ResourceRead>(),
  variantKey = ref(''),
  chosen = ref<string[]>([]),
  parameters = ref('{}')
const projection = ref<'current' | 'history' | 'both'>('both'),
  sample = ref(60),
  upload = ref(300),
  boostSample = ref(0),
  boostUntil = ref('')
const originalBoost = shallowRef<TelemetryProfile['boost']>(null),
  originalBoostDisplay = ref('')
function localDatetime(seconds: number) {
  const date = new Date(seconds * 1000)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
}
const budget = ref({
    points: 256,
    bytes: 1048576,
    resources: 64,
    executionMillis: 10000,
    outputBytes: 65536,
  }),
  backfill = ref(86400)
const preview = ref<Awaited<ReturnType<typeof pc.preview>>>(),
  usages = ref<Awaited<ReturnType<typeof pc.list>>['items']>([]),
  usageNext = ref<string | null>(null),
  confirmed = ref(false),
  comparison = ref<unknown>()
const frozen = shallowRef<{
  profile: TelemetryProfile
  bytes: Uint8Array
  sha256: number[]
  created: boolean
  versioned: boolean
  uploaded: boolean
  activated: boolean
}>()
type Pending =
  | { kind: 'resource'; id: string; body: Operation<ResourceChange> }
  | { kind: 'policy'; id: string; body: Operation<PolicyChange> }
  | { kind: 'upload'; id: string; operationId: string }
const pending = shallowRef<Pending>(),
  policyAction = ref<'put' | 'enable' | 'disable'>('put')
const variants = computed(
  () =>
    template.value?.versions
      .filter((v) => v.state === 'active')
      .flatMap((v) =>
        v.variants.map((variant) => ({
          version: v.id,
          variant,
          key: JSON.stringify([v.id, variant.platform, variant.architecture, variant.key]),
        })),
      ) ?? [],
)
const source = computed(() => variants.value.find((v) => v.key === variantKey.value))
const mapping = computed(() => {
  const d = source.value?.variant.declaration
  if (d?.kind === 'script')
    return d.definition.runAs === 'system' &&
      d.definition.purpose.kind === 'collection' &&
      d.definition.purpose.scope.kind === 'device'
      ? d.definition.purpose.mappings
      : {}
  if (d?.kind === 'agent_collection') {
    const plan = record(d.definition['plan'])
    return record(plan['scope'])['kind'] === 'device' ? record(d.definition['mappings']) : {}
  }
  return {}
})
const eligibleFields = computed(() =>
  fields.value.filter(
    (f) =>
      f.timeSeries &&
      Object.hasOwn(mapping.value, f.key) &&
      f.platforms.includes(source.value?.variant.platform ?? 'windows'),
  ),
)
const locked = computed(() => busy.value || !!pending.value || !!frozen.value || !canWrite.value)
async function load(after?: string) {
  list.value = undefined
  await run(
    () => rc.list({ cursor: after, filter: queryComparison('kind', '==', 'telemetry_profile') }),
    (v) => (list.value = v),
  )
}
async function sources(after?: string) {
  const old = after ? templates.value : []
  templates.value = []
  await run(
    () =>
      rc.list({
        cursor: after,
        filter: allOf(
          queryComparison('kind', '==', templateKind.value),
          queryComparison('active', '==', true),
        ),
      }),
    (v) => {
      templates.value = [...old, ...v.items]
      templateAfter.value = v.nextCursor
    },
  )
}
async function scopes(after?: string) {
  const old = after ? (scopeOptions.value?.items ?? []) : []
  await run(
    () =>
      runtime.policies.scopes.list({ cursor: after, filter: queryComparison('ready', '==', true) }),
    (v) => (scopeOptions.value = { ...v, items: [...old, ...v.items] }),
  )
}
async function selectTemplate() {
  template.value = undefined
  chosen.value = []
  parameters.value = '{}'
  if (!templateId.value) return
  await run(
    () => rc.read(templateId.value),
    (v) => {
      template.value = v
      variantKey.value = variants.value[0]?.key ?? ''
    },
  )
}
async function references(after?: string) {
  const old = after ? usages.value : []
  usages.value = []
  await run(
    () =>
      pc.list({
        cursor: after,
        filter: allOf(
          queryComparison('action', '==', 'telemetry_profile'),
          queryComparison('resource', '==', id.value),
        ),
      }),
    (v) => {
      usages.value = [...old, ...v.items]
      usageNext.value = v.nextCursor
    },
  )
}
function reset() {
  policyAction.value = 'put'
  open.value = false
  frozen.value = undefined
  pending.value = undefined
  preview.value = undefined
  template.value = undefined
  policy.value = undefined
  chosen.value = []
  usages.value = []
  usageNext.value = null
  confirmed.value = false
  comparison.value = undefined
  step.value = 0
}
async function edit(resource?: string) {
  if (pending.value) return
  reset()
  id.value = resource ?? crypto.randomUUID()
  version.value = 'v' + Date.now()
  revision.value = 0
  scope.value = ''
  policyId.value = ''
  templateId.value = ''
  variantKey.value = ''
  projection.value = 'both'
  sample.value = 60
  upload.value = 300
  boostSample.value = 0
  boostUntil.value = ''
  originalBoost.value = null
  originalBoostDisplay.value = ''
  parameters.value = '{}'
  open.value = true
  await run(
    () => runtime.devices.assets.catalog(),
    (v) => (fields.value = v.fields),
  )
  await sources()
  await scopes()
  if (resource) {
    const requestedPolicy = route.query['policy']
    if (typeof requestedPolicy === 'string') {
      policyId.value = requestedPolicy
      await selectPolicy()
      if (policy.value) scope.value = policy.value.definition.scope
    }
    await run(
      () => rc.read(resource),
      (v) => {
        revision.value = v.revision
        const action = policy.value?.definition.action,
          binding = action?.kind === 'telemetry_profile' ? action.resource : undefined
        const active =
            v.versions.find((v) => (binding ? v.id === binding.version : v.state === 'active')) ??
            v.versions[0],
          d = (
            binding
              ? active?.variants.find(
                  (v) =>
                    v.key === binding.variant &&
                    v.platform === binding.platform &&
                    v.architecture === binding.architecture,
                )
              : active?.variants[0]
          )?.declaration
        if (d?.kind === 'telemetry_profile') {
          const p = d.definition
          originalBoost.value = p.boost
          originalBoostDisplay.value = p.boost ? localDatetime(p.boost.expiresAt) : ''
          boostSample.value = p.boost ? p.boost.sampleMillis / 1000 : 0
          boostUntil.value = originalBoostDisplay.value
          templateId.value = p.template.resource
          projection.value = p.projection
          sample.value = p.sampleMillis / 1000
          upload.value = p.uploadMillis / 1000
          budget.value = { ...p.budget }
          backfill.value = p.backfillSeconds
          parameters.value = JSON.stringify(p.parameters, null, 2)
          chosen.value = p.fields.map((f) => f.key)
          variantKey.value = JSON.stringify([
            p.template.version,
            p.template.platform,
            p.template.architecture,
            p.template.variant,
          ])
        }
      },
    )
    if (templateId.value)
      await run(
        () => rc.read(templateId.value),
        (v) => (template.value = v),
      )
    await references()
  }
}
async function selectPolicy() {
  policy.value = undefined
  preview.value = undefined
  confirmed.value = false
  if (!policyId.value) return
  await run(
    () => pc.read(policyId.value),
    (v) => {
      if (
        v.definition.action.kind !== 'telemetry_profile' ||
        v.definition.action.resource.id !== id.value
      )
        throw new Error('Wrong profile Policy')
      policy.value = v
    },
  )
}
function profile() {
  const s = source.value
  if (!s) throw new Error('No template')
  if (chosen.value.some((k) => !eligibleFields.value.some((f) => f.key === k)))
    throw new Error('Field not in template')
  return telemetryProfile({
    template: {
      resource: templateId.value,
      version: s.version,
      variant: s.variant.key,
      platform: s.variant.platform,
      architecture: s.variant.architecture,
    },
    parameters: JSON.parse(parameters.value),
    fields: chosen.value.map((key) => ({
      key,
      version: fields.value.find((f) => f.key === key)!.version,
    })),
    projection: projection.value,
    sampleMillis: sample.value * 1000,
    uploadMillis: upload.value * 1000,
    budget: budget.value,
    boost: boostSample.value
      ? originalBoost.value &&
        boostSample.value * 1000 === originalBoost.value.sampleMillis &&
        boostUntil.value === originalBoostDisplay.value
        ? originalBoost.value
        : { sampleMillis: boostSample.value * 1000, expiresAt: Date.parse(boostUntil.value) / 1000 }
      : null,
    backfillSeconds: backfill.value,
  })
}
const definition = (): PolicyDefinition => {
  const p = frozen.value?.profile
  if (!p) throw new Error('Unpublished profile')
  return {
    scope: scope.value,
    action: {
      kind: 'telemetry_profile',
      resource: {
        id: id.value,
        version: version.value,
        platform: p.template.platform,
        architecture: p.template.architecture,
        variant: p.template.variant,
      },
    },
  }
}
async function prepare() {
  if (busy.value || pending.value || !canWrite.value) return
  try {
    if (!frozen.value) {
      const prepared = await run(
        async () => {
          const p = profile(),
            bytes = telemetryBytes(p),
            sha256 = [
              ...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer)),
            ]
          return {
            profile: p,
            bytes,
            sha256,
            created: revision.value > 0,
            versioned: false,
            uploaded: false,
            activated: false,
          }
        },
        (value) => (frozen.value = value),
      )
      if (!prepared || !frozen.value) return
    }

    const f = frozen.value
    if (!f.created) {
      pending.value = {
        kind: 'resource',
        id: id.value,
        body: operation({ action: 'create', kind: 'telemetry_profile' }, 0),
      }
      if (!(await execute())) return
    }
    if (!f.versioned) {
      const p = f.profile
      const variant: Variant = {
        platform: p.template.platform,
        architecture: p.template.architecture,
        key: p.template.variant,
        declaration: {
          kind: 'telemetry_profile',
          artifact: {
            reference: 'telemetry-profile',
            length: f.bytes.byteLength,
            sha256: f.sha256,
          },
          definition: p,
        },
      }
      pending.value = {
        kind: 'resource',
        id: id.value,
        body: operation(
          {
            action: 'version',
            version: version.value,
            kind: 'telemetry_profile',
            variants: [variant],
          },
          revision.value,
        ),
      }
      if (!(await execute())) return
    }
    if (!f.uploaded) {
      pending.value = { kind: 'upload', id: id.value, operationId: crypto.randomUUID() }
      if (!(await execute())) return
    }
    if (!f.activated) {
      pending.value = {
        kind: 'resource',
        id: id.value,
        body: operation({ action: 'activate', version: version.value }, revision.value),
      }
      if (!(await execute())) return
    }
    await check()
  } catch {
    failure.value = 'invalidRequest'
  }
}
async function execute(): Promise<boolean> {
  const p = pending.value,
    f = frozen.value
  if (!p || busy.value || !f) return false
  let ok = false
  if (p.kind === 'resource')
    ok = await runWrite(
      () => rc.change(p.id, p.body),
      (v) => {
        if (!('storageRevision' in v)) throw new Error('Unexpected receipt')
        revision.value = v.storageRevision
        if (p.body.input.action === 'create') f.created = true
        if (p.body.input.action === 'version') f.versioned = true
        if (p.body.input.action === 'activate') f.activated = true
      },
    )
  else if (p.kind === 'policy')
    ok = await runWrite(
      () => pc.change(p.id, p.body),
      (v) => {
        policy.value = v
        policyId.value = v.id
      },
    )
  else
    ok = await runWrite(
      async () => {
        const target = {
          version: version.value,
          variant: f.profile.template.variant,
          platform: f.profile.template.platform,
          architecture: f.profile.template.architecture,
          artifact: 'telemetry-profile',
        }
        let session = await rc.uploads.begin(p.id, p.operationId, target)
        if (
          session.binding.length !== f.bytes.byteLength ||
          JSON.stringify(session.binding.sha256) !== JSON.stringify(f.sha256)
        )
          throw new Error('Different upload')
        while (session.offset < f.bytes.byteLength) {
          const offset = session.offset,
            bytes = f.bytes.slice(offset, offset + 262144),
            body = new ArrayBuffer(bytes.byteLength)
          new Uint8Array(body).set(bytes)
          const next = await rc.uploads.append(p.id, p.operationId, offset, body)
          if (
            next.offset !== offset + bytes.byteLength ||
            JSON.stringify(next.binding) !== JSON.stringify(session.binding)
          )
            throw new Error('Invalid upload frontier')
          session = next
        }
        await rc.uploads.complete(p.id, p.operationId)
      },
      () => (f.uploaded = true),
    )
  if (pending.value !== p) return false
  if (ok) {
    pending.value = undefined
    comparison.value = undefined
    if (p.kind === 'policy') {
      reset()
      await load()
    }
  } else if (!uncertain.value) pending.value = undefined
  return ok
}
async function compare() {
  const p = pending.value
  if (!p) return
  comparison.value = undefined
  if (p.kind === 'resource')
    await run(
      () => rc.read(p.id),
      (v) => (comparison.value = v),
    )
  else if (p.kind === 'policy')
    await run(
      () => pc.read(p.id),
      (v) => (comparison.value = v),
    )
  else
    await run(
      () => rc.uploads.receipt(p.id, p.operationId),
      (v) => {
        const f = frozen.value
        if (
          !f ||
          v.version !== version.value ||
          v.reference !== 'telemetry-profile' ||
          v.length !== f.bytes.byteLength ||
          JSON.stringify(v.sha256) !== JSON.stringify(f.sha256)
        )
          throw new Error('Wrong upload receipt')
        f.uploaded = true
        pending.value = undefined
        uncertain.value = false
        comparison.value = v
      },
    )
}
function collectionSupported(item: NonNullable<typeof preview.value>['items'][number]) {
  return 'collectionSupported' in item ? item.collectionSupported : null
}
async function check(after?: string) {
  if (!frozen.value?.activated || !scope.value || pending.value) return
  confirmed.value = false
  const previous = after ? preview.value : undefined
  preview.value = undefined
  await run(
    () => pc.preview(definition(), after, previous?.scopeResult),
    (v) => (preview.value = { ...v, items: [...(previous?.items ?? []), ...v.items] }),
  )
}
async function publish() {
  if (
    !confirmed.value ||
    !preview.value ||
    preview.value.nextCursor ||
    usageNext.value ||
    pending.value ||
    !canWrite.value
  )
    return
  pending.value = {
    kind: 'policy',
    id: policy.value?.id ?? crypto.randomUUID(),
    body: operation(
      policyAction.value === 'put'
        ? { action: 'put', enabled: true, definition: structuredClone(toRaw(definition())) }
        : { action: policyAction.value },
      policy.value?.revision ?? 0,
    ),
  }
  await execute()
}
async function toggle(summary: { id: string }) {
  if (locked.value) return
  let actual: PolicyRead | undefined
  if (
    !(await run(
      () => pc.read(summary.id),
      (v) => {
        actual = v
      },
    )) ||
    !actual
  )
    return
  const p = actual
  if (
    busy.value ||
    pending.value ||
    !canWrite.value ||
    p.definition.action.kind !== 'telemetry_profile'
  )
    return
  const binding = p.definition.action.resource
  const ok = await run(
    () => rc.read(binding.id),
    (v) => {
      const d = v.versions
        .find((x) => x.id === binding.version)
        ?.variants.find(
          (x) =>
            x.key === binding.variant &&
            x.platform === binding.platform &&
            x.architecture === binding.architecture,
        )?.declaration
      if (d?.kind !== 'telemetry_profile') throw new Error('Wrong profile')
      const spec = d.definition
      frozen.value = {
        profile: spec,
        bytes: telemetryBytes(spec),
        sha256: [],
        created: true,
        versioned: true,
        uploaded: true,
        activated: true,
      }
      id.value = binding.id
      version.value = binding.version
      templateId.value = spec.template.resource
      chosen.value = spec.fields.map((f) => f.key)
      projection.value = spec.projection
      sample.value = spec.sampleMillis / 1000
      upload.value = spec.uploadMillis / 1000
    },
  )
  if (!ok) return
  policy.value = p
  policyId.value = p.id
  scope.value = p.definition.scope
  policyAction.value = p.enabled ? 'disable' : 'enable'
  open.value = true
  step.value = 2
  await check()
}

watch(scope, () => {
  preview.value = undefined
  confirmed.value = false
})
watch(
  () => JSON.stringify(deviceBinding(runtime)),
  () => {
    reset()
    list.value = undefined
    fields.value = []
    templates.value = []
    void load().then(() => {
      const resource = route.query['resource']
      if (typeof resource === 'string') void edit(resource)
    })
  },
  { immediate: true, flush: 'sync' },
)
watch(
  () => route.query['resource'],
  (v) => {
    if (typeof v === 'string') void edit(v)
  },
)
</script>
<template>
  <PageFrame :title="t('telemetry.profiles')" :busy="busy" :failure="failure"
    ><template #actions
      ><RouterLink :to="{ name: 'policy-resources', params: { tenant: runtime.tenant } }">{{
        t('telemetry.resourceLibrary')
      }}</RouterLink
      ><RouterLink :to="{ name: 'settings-metrics', params: { tenant: runtime.tenant } }">{{
        t('telemetry.metricsSettings')
      }}</RouterLink
      ><UiButton :disabled="busy || !canWrite || !!pending" @click="edit()">{{
        t('telemetry.newProfile')
      }}</UiButton></template
    >
    <p>{{ t('telemetry.profilesHint') }}</p>
    <div class="telemetry-profile-grid">
      <article
        v-for="item in list?.items"
        :key="item.id"
        class="console-panel telemetry-profile-card"
      >
        <span class="telemetry-eyebrow">{{
          t(item.activeVersion ? 'telemetry.active' : 'telemetry.draft')
        }}</span>
        <h2>{{ item.id }}</h2>
        <p>{{ item.activeVersion ?? '—' }} · {{ t('telemetry.revision') }} {{ item.revision }}</p>
        <UiButton :disabled="busy || !!pending" @click="edit(item.id)">{{
          t(canWrite ? 'telemetry.configure' : 'telemetry.view')
        }}</UiButton>
      </article>
    </div>
    <p v-if="list && !list.items.length" class="telemetry-empty">{{ t('telemetry.noProfiles') }}</p>
    <UiButton v-if="list?.nextCursor" :disabled="busy" @click="load(list.nextCursor)">{{
      t('devices.next')
    }}</UiButton>
    <UiDialog
      :open="open"
      :title="t('telemetry.profileEditor')"
      :close-label="t('console.cancel')"
      placement="right"
      @update:open="!pending && (open = $event)"
      ><section class="telemetry-form">
        <ol class="telemetry-steps">
          <li
            v-for="(name, i) in ['sourceStep', 'cadenceStep', 'publishStep']"
            :key="name"
            :aria-current="step === i ? 'step' : undefined"
          >
            {{ i + 1 }} · {{ t('telemetry.' + name) }}
          </li>
        </ol>
        <UiMessage v-if="failure" tone="danger" :title="t('devices.' + failure)" />
        <fieldset v-if="step === 0" :disabled="locked">
          <label
            >{{ t('telemetry.templateKind')
            }}<select
              v-model="templateKind"
              :aria-label="t('telemetry.templateKind')"
              class="ui-input"
              @change="sources()"
            >
              <option value="agent_collection">{{ t('telemetry.nativeTemplate') }}</option>
              <option value="script">{{ t('telemetry.scriptTemplate') }}</option>
            </select></label
          ><label
            >{{ t('telemetry.template')
            }}<select
              v-model="templateId"
              :aria-label="t('telemetry.template')"
              class="ui-input"
              @change="selectTemplate"
            >
              <option value="">{{ t('devices.select') }}</option>
              <option v-for="item in templates" :key="item.id" :value="item.id">
                {{ item.id }} / {{ item.activeVersion }}
              </option>
            </select></label
          ><UiButton v-if="templateAfter" @click="sources(templateAfter)">{{
            t('devices.next')
          }}</UiButton
          ><label
            >{{ t('telemetry.variant')
            }}<select
              v-model="variantKey"
              :aria-label="t('telemetry.variant')"
              class="ui-input"
              @change="chosen = []"
            >
              <option v-for="v in variants" :key="v.key" :value="v.key">
                {{ v.version }} / {{ v.variant.platform }} / {{ v.variant.architecture }} /
                {{ v.variant.key }}
              </option>
            </select></label
          ><label
            >{{ t('telemetry.parameters')
            }}<textarea v-model="parameters" class="ui-input telemetry-code" />
          </label>
          <h3>{{ t('telemetry.fieldsAndMappings') }}</h3>
          <p v-if="!eligibleFields.length">{{ t('telemetry.noMappedFields') }}</p>
          <label v-for="f in eligibleFields" :key="f.key" class="telemetry-pick"
            ><input v-model="chosen" type="checkbox" :value="f.key" /><span
              ><strong>{{ f.key }} / v{{ f.version }}</strong
              ><small>{{ f.timeSeries?.kind }} · {{ f.unit }} · {{ f.sensitivity }}</small
              ><code>{{ JSON.stringify(mapping[f.key]) }}</code></span
            ></label
          ><RouterLink :to="{ name: 'policy-resources', params: { tenant: runtime.tenant } }">{{
            t('telemetry.manageTemplates')
          }}</RouterLink>
        </fieldset>
        <fieldset v-if="step === 1" :disabled="locked">
          <label>{{ t('telemetry.version') }}<input v-model="version" class="ui-input" /></label
          ><label
            >{{ t('telemetry.projection')
            }}<select v-model="projection" :aria-label="t('telemetry.projection')" class="ui-input">
              <option value="current">{{ t('telemetry.current') }}</option>
              <option value="history">{{ t('telemetry.historyOnly') }}</option>
              <option value="both">{{ t('telemetry.both') }}</option>
            </select></label
          >
          <p>{{ t('telemetry.projectionHint') }}</p>
          <div class="telemetry-toolbar">
            <label
              >{{ t('telemetry.sampleSeconds')
              }}<input v-model.number="sample" class="ui-input" type="number" min="1" /></label
            ><label
              >{{ t('telemetry.uploadSeconds')
              }}<input v-model.number="upload" class="ui-input" type="number" min="1"
            /></label>
          </div>
          <label
            >{{ t('telemetry.scope')
            }}<select v-model="scope" :aria-label="t('telemetry.scope')" class="ui-input">
              <option value="">{{ t('devices.select') }}</option>
              <option
                v-for="s in scopeOptions?.items.filter((s) => !s.deleted)"
                :key="s.id"
                :value="s.id"
              >
                {{ s.id }} / {{ s.resolution ?? '—' }}
              </option>
            </select></label
          ><UiButton v-if="scopeOptions?.nextCursor" @click="scopes(scopeOptions.nextCursor)">{{
            t('devices.next')
          }}</UiButton>
          <details>
            <summary>{{ t('telemetry.budget') }}</summary>
            <label
              v-for="name in [
                'points',
                'bytes',
                'resources',
                'executionMillis',
                'outputBytes',
              ] as const"
              :key="name"
              >{{ t('telemetry.' + name)
              }}<input
                v-model.number="budget[name]"
                class="ui-input"
                type="number"
                min="1" /></label
            ><label
              >{{ t('telemetry.backfillSeconds')
              }}<input v-model.number="backfill" class="ui-input" type="number" min="1" /></label
            ><label
              >{{ t('telemetry.boostSeconds')
              }}<input v-model.number="boostSample" class="ui-input" type="number" min="0" /></label
            ><label
              >{{ t('telemetry.boostUntil')
              }}<input v-model="boostUntil" type="datetime-local" step="1" class="ui-input"
            /></label>
          </details>
        </fieldset>
        <section v-if="step === 2">
          <h3>{{ t('telemetry.reviewProfile') }}</h3>
          <p class="telemetry-notice">
            {{ t('telemetry.projectionHint') }} {{ t('telemetry.exactBindingHint') }}
          </p>
          <dl class="telemetry-facts">
            <dt>{{ t('telemetry.resource') }}</dt>
            <dd>{{ id }} / {{ version }}</dd>
            <dt>{{ t('telemetry.template') }}</dt>
            <dd>{{ templateId }} / {{ source?.version }} / {{ source?.variant.key }}</dd>
            <dt>{{ t('telemetry.fields') }}</dt>
            <dd>{{ chosen.join(', ') }}</dd>
            <dt>{{ t('telemetry.projection') }}</dt>
            <dd>{{ projection }}</dd>
            <dt>{{ t('telemetry.sampleSeconds') }}</dt>
            <dd>{{ sample }} / {{ upload }}</dd>
          </dl>
          <h3>{{ t('telemetry.existingAssignments') }}</h3>
          <article v-for="p in usages" :key="p.id" class="telemetry-log">
            <strong>{{ p.id }} · {{ p.state }}</strong>
            <p>
              {{ p.definition.scope }} /
              {{
                p.definition.action.kind === 'telemetry_profile'
                  ? p.definition.action.resource.version
                  : '—'
              }}
            </p>
            <UiButton :disabled="busy || !!pending || !canWrite" @click="toggle(p)">{{
              t(p.state === 'enabled' ? 'telemetry.disablePolicy' : 'telemetry.enablePolicy')
            }}</UiButton>
          </article>
          <UiButton v-if="usageNext" :disabled="busy" @click="references(usageNext)">{{
            t('devices.next')
          }}</UiButton>
          <p v-if="!usageNext && !usages.length">{{ t('telemetry.empty') }}</p>
          <fieldset :disabled="busy || !!pending || !canWrite">
            <p v-if="policyAction !== 'put'" class="telemetry-notice">
              {{
                t(policyAction === 'disable' ? 'telemetry.disablePolicy' : 'telemetry.enablePolicy')
              }}
            </p>
            <label v-if="policyAction === 'put'"
              >{{ t('telemetry.policy')
              }}<select
                v-model="policyId"
                :aria-label="t('telemetry.policy')"
                class="ui-input"
                @change="selectPolicy"
              >
                <option value="">{{ t('telemetry.newPolicy') }}</option>
                <option
                  v-for="p in usages.filter((p) => p.state !== 'archived')"
                  :key="p.id"
                  :value="p.id"
                >
                  {{ p.id }}
                </option>
              </select></label
            ><UiButton v-if="!frozen?.activated" :disabled="!scope" @click="prepare">{{
              t('telemetry.prepareResource')
            }}</UiButton
            ><UiButton v-else @click="check()">{{ t('telemetry.previewTargets') }}</UiButton>
          </fieldset>
          <p v-if="frozen" class="telemetry-caption">
            {{ t('telemetry.saved') }} {{ frozen.created ? '✓' : '—' }} ·
            {{ t('telemetry.versioned') }} {{ frozen.versioned ? '✓' : '—' }} ·
            {{ t('telemetry.contentReady') }} {{ frozen.uploaded ? '✓' : '—' }} ·
            {{ t('telemetry.active') }} {{ frozen.activated ? '✓' : '—' }}
          </p>
          <section v-if="preview">
            <h3>{{ t('telemetry.targetPreview') }} · {{ preview.items.length }}</h3>
            <p v-if="preview.nextCursor">{{ t('telemetry.previewIncomplete') }}</p>
            <div class="telemetry-table-wrap">
              <table class="telemetry-table">
                <thead>
                  <tr>
                    <th>{{ t('telemetry.target') }}</th>
                    <th>{{ t('telemetry.eligibility') }}</th>
                    <th>{{ t('telemetry.capability') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, i) in preview.items" :key="i">
                    <td>{{ item.object.id }}</td>
                    <td>
                      {{ item.eligibility.state }} / {{ item.availability }} /
                      {{ item.reason ?? '—' }}
                    </td>
                    <td>
                      {{
                        collectionSupported(item) === null
                          ? '—'
                          : t(
                              collectionSupported(item)
                                ? 'telemetry.supported'
                                : 'telemetry.unsupported',
                            )
                      }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <UiButton
              v-if="preview.nextCursor"
              :disabled="busy"
              @click="check(preview.nextCursor)"
              >{{ t('devices.next') }}</UiButton
            ><label class="telemetry-pick"
              ><input
                v-model="confirmed"
                type="checkbox"
                :disabled="!!preview.nextCursor || !!usageNext"
              />{{ t('telemetry.confirmPublish') }}</label
            ><UiButton :disabled="busy || !confirmed || !!pending || !canWrite" @click="publish">{{
              t('telemetry.publishPolicy')
            }}</UiButton>
          </section>
        </section>
        <WriteRecovery
          v-if="pending && uncertain"
          :id="pending.kind === 'upload' ? pending.operationId : pending.body.operationId"
          :busy="busy"
          :can-write="canWrite"
          :comparison="comparison"
          @compare="compare"
          @replay="execute"
        />
        <footer class="telemetry-toolbar">
          <UiButton v-if="step > 0" :disabled="busy || !!pending || !!frozen" @click="step--">{{
            t('telemetry.previous')
          }}</UiButton
          ><UiButton
            v-if="step < 2"
            :disabled="busy || !chosen.length || (step === 1 && !scope)"
            @click="step++"
            >{{ t('telemetry.continue') }}</UiButton
          >
        </footer>
      </section></UiDialog
    >
  </PageFrame>
</template>
