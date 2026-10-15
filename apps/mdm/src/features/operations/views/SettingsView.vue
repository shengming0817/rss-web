<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { utc } from '../presentation'
import { onMounted, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import { configurationValues, maintenanceKinds, type Maintenance } from '../clients/admin-model'
import PageFrame from '../../../components/PageFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.operations.admin,
  { run, runWrite, busy, failure, uncertain } = useOperation()
const configuration = ref<Awaited<ReturnType<typeof client.settings.read>>>(),
  diagnostics = ref<Awaited<ReturnType<typeof client.settings.diagnostics>>>(),
  draft = ref({
    name: '',
    publicOrigin: '',
    certificateRef: null as string | null,
    apnsRef: null as string | null,
  }),
  revision = ref(0),
  conflict = ref(false),
  page = ref<Awaited<ReturnType<typeof client.maintenance.list>>>(),
  selected = ref<Maintenance>(),
  kind = ref<Maintenance['input']['kind']>('backup'),
  target = ref('backup-1'),
  method = ref<Maintenance['input']['method']>('full')
watch(kind, () => {
  if (kind.value !== 'agent_upgrade') method.value = 'full'
})
let pending: (() => Promise<boolean>) | undefined
async function read(replace = false) {
  await run(
    () => client.settings.read(),
    (v) => {
      configuration.value = v
      if (replace) {
        draft.value = structuredClone(v.values)
        revision.value = v.revision
      }
    },
  )
}
async function health() {
  await run(
    () => client.settings.diagnostics(),
    (v) => (diagnostics.value = v),
  )
}
async function load(cursor?: string) {
  await run(
    () => client.maintenance.list(cursor),
    (v) => (page.value = v),
  )
}
function save(activate = false) {
  if (busy.value || uncertain.value || conflict.value) return
  try {
    const submit = activate
      ? (() => {
          const body = operation({}, revision.value)
          return () => client.settings.activate(body)
        })()
      : (() => {
          const body = operation(
            configurationValues({
              ...structuredClone(toRaw(draft.value)),
              certificateRef: draft.value.certificateRef === '' ? null : draft.value.certificateRef,
              apnsRef: draft.value.apnsRef === '' ? null : draft.value.apnsRef,
            }),
            revision.value,
          )
          return () => client.settings.save(body)
        })()
    pending = async () => {
      const saved = await runWrite(submit, (v) => {
        configuration.value = v
        revision.value = v.revision
      })
      if (saved)
        await run(
          () => client.settings.read(),
          (v) => {
            configuration.value = v
            revision.value = v.revision
          },
        )
      else if (failure.value === 'conflict') conflict.value = true
      return saved
    }
    void pending()
  } catch {
    failure.value = 'invalidRequest'
  }
}
function start() {
  if (busy.value || uncertain.value) return
  const body = operation({ kind: kind.value, target: target.value, method: method.value })
  pending = async () => {
    const accepted = await runWrite(
      () => client.maintenance.start(body),
      (v) => (selected.value = v),
    )
    if (accepted && (await open(body.operationId))) await load()
    return accepted
  }
  void pending()
}
function change(action: 'pause' | 'resume' | 'cancel') {
  if (!selected.value || busy.value || uncertain.value) return
  const id = selected.value.id,
    body = operation({}, selected.value.revision)
  pending = async () => {
    const changed = await runWrite(
      () => client.maintenance.change(id, action, body),
      (v) => (selected.value = v),
    )
    if (changed) await open(id)
    return changed
  }
  void pending()
}
async function open(id: string) {
  if (uncertain.value && id !== selected.value?.id) return false
  if (!uncertain.value) selected.value = undefined
  return run(
    () => client.maintenance.read(id),
    (v) => (selected.value = v),
  )
}
function routeTarget() {
  selected.value = undefined
  pending = undefined
  if (typeof route.query['id'] === 'string') void open(route.query['id'])
}
watch(() => route.fullPath, routeTarget, { flush: 'post' })
function adopt() {
  if (!configuration.value) return
  revision.value = configuration.value.revision
  conflict.value = false
}
onMounted(async () => {
  await read(true)
  await health()
  await load()
  routeTarget()
})
</script>
<template>
  <PageFrame :title="t('operations.settings')" :busy="busy" :failure="failure">
    <p>{{ t('operations.settingsHint') }}</p>
    <p v-if="configuration">
      {{ configuration.state }} · {{ t('operations.savedVersion') }}
      {{ configuration.savedVersion }} / {{ t('operations.activeVersion') }}
      {{ configuration.activeVersion }} · {{ configuration.revision }}
    </p>
    <form @submit.prevent="save()">
      <fieldset :disabled="busy || uncertain">
        <legend>{{ t('operations.configuration') }}</legend>
        <label
          >{{ t('operations.name')
          }}<input
            v-model="draft.name"
            class="ui-input"
            data-testid="configuration-name"
            required /></label
        ><label
          >{{ t('operations.origin')
          }}<input v-model="draft.publicOrigin" class="ui-input" type="url" required /></label
        ><label
          >{{ t('operations.certificateRef')
          }}<input v-model="draft.certificateRef" class="ui-input" /></label
        ><label
          >APNs {{ t('operations.credentialRef')
          }}<input v-model="draft.apnsRef" class="ui-input" /></label
        ><UiButton data-testid="save-configuration" :disabled="!!conflict" type="submit">
          {{ t('devices.save') }}</UiButton
        ><UiButton
          type="button"
          data-testid="activate-configuration"
          :disabled="!!(conflict || configuration?.state !== 'saved')"
          @click="save(true)"
        >
          {{ t('operations.activate') }}
        </UiButton>
      </fieldset>
    </form>
    <UiButton :disabled="!!busy" type="submit" @click="read()">{{
      t('operations.compare')
    }}</UiButton
    ><UiButton
      v-if="configuration && configuration.revision !== revision"
      :disabled="!!(busy || uncertain)"
      type="submit"
      @click="adopt()"
    >
      {{ t('operations.adoptRevision') }}
    </UiButton>
    <h2>{{ t('operations.diagnostics') }}</h2>
    <UiButton :disabled="!!busy" type="submit" @click="health()">{{
      t('devices.reload')
    }}</UiButton>
    <section v-if="diagnostics">
      <p>
        {{ diagnostics.scope }} ·
        {{ diagnostics.complete ? t('operations.complete') : t('operations.partial') }} ·
        {{ utc(diagnostics.asOf) }} · {{ diagnostics.deployment }}
      </p>
      <ul>
        <li v-for="c in diagnostics.components" :key="c.name">
          {{ c.name }} · {{ c.state }} · {{ c.expiresAt === null ? '—' : utc(c.expiresAt) }}
        </li>
      </ul>
      <dl>
        <dt>{{ t('operations.taskBacklog') }}</dt>
        <dd>{{ diagnostics.taskBacklog ?? t('mdm.unknown') }}</dd>
        <dt>{{ t('operations.projectionBacklog') }}</dt>
        <dd>{{ diagnostics.projectionBacklog ?? t('mdm.unknown') }}</dd>
        <dt>{{ t('operations.content') }}</dt>
        <dd>{{ diagnostics.content }}</dd>
      </dl>
      <h3>{{ t('operations.agents') }}</h3>
      <ul>
        <li v-for="a in diagnostics.agents" :key="a.device">
          <RouterLink
            :to="{ name: 'device-detail', params: { tenant: runtime.tenant, device: a.device } }"
            >{{ a.device }}</RouterLink
          >
          · {{ a.platform }} / {{ a.version ?? t('mdm.unknown') }} / {{ a.health }}
        </li>
      </ul>
      <h3>{{ t('operations.backups') }}</h3>
      <p>{{ diagnostics.backups.join(' · ') || t('operations.empty') }}</p>
    </section>
    <h2>{{ t('operations.maintenance') }}</h2>
    <p>{{ t('operations.maintenanceHint') }}</p>
    <form @submit.prevent="start()">
      <fieldset :disabled="busy || uncertain">
        <label
          >{{ t('operations.action')
          }}<select v-model="kind" class="ui-input">
            <option v-for="value in maintenanceKinds" :key="value">{{ value }}</option>
          </select></label
        ><label
          >{{ t('operations.targetVersion')
          }}<input v-model="target" class="ui-input" required /></label
        ><label
          >{{ t('operations.updateMethod')
          }}<select v-model="method" class="ui-input" :disabled="kind !== 'agent_upgrade'">
            <option>full</option>
            <option v-if="kind === 'agent_upgrade'">delta</option>
          </select></label
        ><UiButton data-testid="start-maintenance" type="submit">{{
          t('operations.start')
        }}</UiButton>
      </fieldset>
    </form>
    <UiButton :disabled="!!busy" type="submit" @click="load()">{{
      t('operations.history')
    }}</UiButton>
    <ul>
      <li v-for="item in page?.items" :key="item.id">
        <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="open(item.id)">
          {{ item.id }} · {{ item.input.kind }} / {{ item.phase }}
        </UiButton>
      </li>
    </ul>
    <UiButton
      v-if="page?.nextCursor"
      :disabled="!!busy"
      type="submit"
      @click="load(page.nextCursor)"
    >
      {{ t('devices.next') }}
    </UiButton>
    <section v-if="selected">
      <h3>{{ selected.id }}</h3>
      <p>{{ selected.phase }} / {{ selected.input.kind }} / {{ selected.input.target }}</p>
      <dl>
        <dt>{{ t('operations.effect') }}</dt>
        <dd>{{ selected.effect }}</dd>
        <dt>{{ t('operations.components') }}</dt>
        <dd>{{ selected.components.join(' · ') || '—' }}</dd>
        <dt>{{ t('operations.downloadBytes') }}</dt>
        <dd>{{ selected.downloadBytes ?? t('mdm.unknown') }}</dd>
        <dt>{{ t('operations.rebuild') }}</dt>
        <dd>{{ selected.rebuild }}</dd>
        <dt>{{ t('operations.fallback') }}</dt>
        <dd>{{ selected.fallback ?? '—' }}</dd>
        <dt>{{ t('operations.health') }}</dt>
        <dd>{{ selected.health }}</dd>
      </dl>
      <UiButton :disabled="!!busy" type="submit" @click="open(selected.id)">{{
        t('policies.refresh')
      }}</UiButton
      ><UiButton
        v-if="selected.phase === 'accepted'"
        :disabled="!!(busy || uncertain)"
        type="submit"
        @click="change('pause')"
      >
        {{ t('operations.pause') }}</UiButton
      ><UiButton
        v-if="selected.phase === 'paused'"
        :disabled="!!(busy || uncertain)"
        type="submit"
        @click="change('resume')"
      >
        {{ t('operations.resume') }}</UiButton
      ><UiButton
        v-if="selected.phase === 'accepted'"
        :disabled="!!(busy || uncertain)"
        type="submit"
        @click="change('cancel')"
      >
        {{ t('operations.cancel') }}
      </UiButton>
    </section>
    <UiButton
      v-if="uncertain && pending"
      data-testid="replay-write"
      :disabled="!!busy"
      type="submit"
      @click="pending()"
    >
      {{ t('policies.replay') }}
    </UiButton>
  </PageFrame>
</template>
