<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { onMounted, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import { signals, alertRuleDefinition, type AlertRule } from '../clients/admin-model'
import PageFrame from '../../../components/PageFrame.vue'
const editorOpen = ref(false)
function beginCreate() {
  if (busy.value || uncertain.value) return
  create()
  editorOpen.value = true
}
const { t } = useI18n(),
  route = useRoute(),
  client = useMdm().operations.admin.alertRules,
  { run, runWrite, busy, failure, uncertain } = useOperation()
const fresh = (): AlertRule['definition'] => ({
  name: '',
  signal: 'projection_backlog',
  threshold: 1,
  enabled: true,
})
const page = ref<Awaited<ReturnType<typeof client.list>>>(),
  id = ref<string>(crypto.randomUUID()),
  revision = ref(0),
  draft = ref(fresh()),
  remote = ref<AlertRule>(),
  conflict = ref(false)
let pending: (() => Promise<boolean>) | undefined
async function load(cursor?: string) {
  await run(
    () => client.list(cursor),
    (v) => (page.value = v),
  )
}
function open(item: AlertRule) {
  if (uncertain.value) return
  id.value = item.id
  revision.value = item.revision
  draft.value = structuredClone(toRaw(item.definition))
  conflict.value = false
  remote.value = undefined
}
function create() {
  if (busy.value || uncertain.value) return
  id.value = crypto.randomUUID()
  revision.value = 0
  draft.value = fresh()
  conflict.value = false
  remote.value = undefined
  pending = undefined
}
function save() {
  if (busy.value || uncertain.value || conflict.value) return
  try {
    const target = id.value,
      body = operation(alertRuleDefinition(structuredClone(toRaw(draft.value))), revision.value)
    pending = async () => {
      const saved = await runWrite(
        () => client.save(target, body),
        (v) => (revision.value = v.revision),
      )
      if (saved) await load()
      else if (failure.value === 'conflict') conflict.value = true
      return saved
    }
    void pending()
  } catch {
    failure.value = 'invalidRequest'
  }
}
async function compare(target = id.value, replace = false) {
  await run(
    async () => {
      let cursor: string | undefined
      do {
        const p = await client.list(cursor),
          item = p.items.find((v) => v.id === target)
        if (item) return item
        cursor = p.nextCursor ?? undefined
      } while (cursor)
      throw new Error('Rule absent')
    },
    (v) => {
      if (replace) open(v)
      else remote.value = v
    },
  )
}
function adopt() {
  if (!remote.value) return
  revision.value = remote.value.revision
  conflict.value = false
}
function routeTarget() {
  pending = undefined
  create()
  if (typeof route.query['id'] === 'string') void compare(route.query['id'], true)
}
watch(() => route.fullPath, routeTarget, { flush: 'post' })
onMounted(async () => {
  await load()
  routeTarget()
})
</script>
<template>
  <PageFrame :title="t('operations.alertRules')" :busy="busy" :failure="failure"
    ><p>{{ t('operations.alertRuleHint') }}</p>
    <UiButton :disabled="!!busy" type="submit" @click="load()">{{ t('devices.reload') }}</UiButton
    ><UiButton :disabled="!!(busy || uncertain)" type="submit" @click="beginCreate()">{{
      t('operations.newRule')
    }}</UiButton>
    <ul class="console-object-list">
      <li v-for="item in page?.items" :key="item.id">
        <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="open(item)">
          {{ item.definition.name }} · {{ item.definition.signal }} / {{ item.revision }}
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
    <details
      class="console-panel console-task"
      :open="editorOpen || uncertain || undefined"
      @toggle="editorOpen = ($event.target as HTMLDetailsElement).open"
    >
      <summary>{{ t('console.edit') }}</summary>
      <form @submit.prevent="save()">
        <fieldset :disabled="busy || uncertain">
          <legend>{{ id }} / {{ revision }}</legend>
          <label
            >{{ t('operations.name')
            }}<input
              v-model="draft.name"
              class="ui-input"
              data-testid="alert-rule-name"
              required /></label
          ><label
            >{{ t('operations.signal')
            }}<select v-model="draft.signal" class="ui-input">
              <option v-for="value in signals" :key="value">{{ value }}</option>
            </select></label
          ><label
            >{{ t('operations.threshold')
            }}<input
              v-model.number="draft.threshold"
              class="ui-input"
              type="number"
              min="0"
              required /></label
          ><label
            ><input v-model="draft.enabled" type="checkbox" />{{ t('operations.enabled') }}</label
          ><UiButton data-testid="save-alert-rule" :disabled="!!conflict" type="submit">{{
            t('devices.save')
          }}</UiButton>
        </fieldset>
      </form>
    </details>
    <UiButton v-if="revision" :disabled="!!busy" type="submit" @click="compare()">
      {{ t('operations.compare') }}
    </UiButton>
    <p v-if="remote">
      {{ remote.definition.name }} / {{ remote.revision
      }}<UiButton :disabled="!!(busy || uncertain)" type="submit" @click="adopt()">
        {{ t('operations.adoptRevision') }}
      </UiButton>
    </p>
    <UiButton
      v-if="uncertain && pending"
      data-testid="replay-write"
      :disabled="!!busy"
      type="submit"
      @click="pending()"
    >
      {{ t('policies.replay') }}
    </UiButton></PageFrame
  >
</template>
