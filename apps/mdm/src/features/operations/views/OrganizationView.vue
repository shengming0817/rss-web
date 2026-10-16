<script setup lang="ts">
import { UiButton, UiDialog, UiTabs } from '@rss/core/components'
import { utc } from '../presentation'
import { onMounted, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { isRssApiError } from '@rss/api/mdm'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { user, type UserGroup } from '../clients/authorization'
import PageFrame from '../../../components/PageFrame.vue'
const confirmingAction = ref<'delete'>()
function confirmAction() {
  const action = confirmingAction.value
  confirmingAction.value = undefined
  if (action === 'delete') save(true)
}
const section = ref('groups')
const editorOpen = ref(false)
function beginCreate() {
  if (busy.value || uncertain.value) return
  create()
  editorOpen.value = true
}
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.operations.authorization,
  { run, runWrite, busy, failure, uncertain } = useOperation()
const page = ref<Awaited<ReturnType<typeof client.groups>>>(),
  department = ref<Awaited<ReturnType<typeof client.departments>>>(),
  delegations = ref<Awaited<ReturnType<typeof runtime.operations.admin.delegations>>>(),
  effective = ref<Awaited<ReturnType<typeof client.effective>>>()
const fresh = (): UserGroup => ({ name: '', enabled: true, members: [] })
const draft = ref(fresh()),
  id = ref<string>(crypto.randomUUID()),
  revision = ref(0),
  member = ref(''),
  remote = ref<UserGroup | null>(),
  remoteRevision = ref<number>(),
  editing = ref(false),
  deleted = ref(false),
  missing = ref(false),
  conflict = ref(false)
let pending: (() => Promise<boolean>) | undefined
async function load(after?: string) {
  await run(
    () => client.groups(after),
    (v) => (page.value = v),
  )
}
async function open(group: string, replace = true) {
  if (replace) section.value = 'groups'
  await run(
    async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const summary = await client.findGroup(group)
        if (!summary) return null
        if (!summary.value) return { definition: null, revision: summary.revision }
        try {
          const members = await client.allMembers(group, summary.revision)
          if (members.length !== summary.value.memberCount) throw new Error('Incomplete membership')
          return {
            definition: { name: summary.value.name, enabled: summary.value.enabled, members },
            revision: summary.revision,
          }
        } catch (error) {
          if (attempt === 0 && isRssApiError(error) && error.status === 409) continue
          throw error
        }
      }
      throw new Error('Membership changed again')
    },
    (v) => {
      if (!v) {
        id.value = group
        revision.value = 0
        draft.value = fresh()
        missing.value = true
        failure.value = 'notFound'
        return
      }
      missing.value = false
      if (replace) {
        id.value = group
        revision.value = v.revision
        draft.value = v.definition ?? fresh()
        deleted.value = v.definition === null
        editing.value = true
        editorOpen.value = true
        remote.value = undefined
        remoteRevision.value = undefined
        conflict.value = false
      } else {
        remote.value = v.definition
        remoteRevision.value = v.revision
      }
    },
  )
}
function create() {
  if (busy.value || uncertain.value) return
  id.value = crypto.randomUUID()
  revision.value = 0
  draft.value = fresh()
  editing.value = false
  conflict.value = false
  deleted.value = false
  missing.value = false
  remote.value = undefined
  remoteRevision.value = undefined
  pending = undefined
}
function add() {
  if (!effective.value || !member.value) return
  try {
    const value = user(
      {
        instanceId: effective.value.instanceId,
        tenantId: runtime.tenant,
        principalId: member.value,
      },
      runtime.tenant,
    )
    if (!draft.value.members.some((m) => m.principalId === value.principalId))
      draft.value.members.push(value)
    member.value = ''
    if (!conflict.value) failure.value = null
  } catch {
    failure.value = 'invalidRequest'
  }
}
function save(remove = false) {
  if (busy.value || uncertain.value || conflict.value || deleted.value || missing.value) return
  const target = id.value,
    body = {
      operationId: crypto.randomUUID(),
      expectedRevision: revision.value,
      value: remove ? null : structuredClone(toRaw(draft.value)),
    }
  pending = async () => {
    const saved = await runWrite(
      () => client.changeGroup(target, body),
      (v) => {
        revision.value = v.revision
        editing.value = !v.deleted
        remote.value = undefined
        remoteRevision.value = undefined
        if (v.deleted) {
          draft.value = fresh()
          id.value = crypto.randomUUID()
          revision.value = 0
        }
      },
    )
    if (saved) await load()
    else if (failure.value === 'conflict') conflict.value = true
    return saved
  }
  void pending()
}
function adopt() {
  if (remoteRevision.value === undefined) return
  revision.value = remoteRevision.value
  remoteRevision.value = undefined
  remote.value = undefined
  conflict.value = false
  failure.value = null
}
async function routeTarget() {
  section.value = route.query['kind'] === 'delegation' ? 'delegations' : 'groups'
  if (typeof route.query['id'] === 'string') {
    if (route.query['kind'] === 'delegation') {
      await run(
        async () => {
          let cursor: string | undefined
          const seen = new Set<string>()
          do {
            const p = await runtime.operations.admin.delegations(cursor)
            if (p.items.some((v) => v.id === route.query['id'])) return p
            cursor = p.nextCursor ?? undefined
            if (cursor) {
              if (seen.has(cursor)) throw new Error('Repeated cursor')
              seen.add(cursor)
            }
          } while (cursor)
          throw new Error('Delegation absent')
        },
        (v) => (delegations.value = v),
      )
    } else await open(route.query['id'])
  }
}
watch(
  () => route.fullPath,
  () => {
    pending = undefined
    create()
    void routeTarget()
  },
  { flush: 'post' },
)
onMounted(async () => {
  await run(
    () => client.effective(),
    (v) => (effective.value = v),
  )
  await load()
  await routeTarget()
})
</script>
<template>
  <PageFrame :title="t('operations.organization')" :busy="busy" :failure="failure">
    <p>{{ t('operations.organizationHint') }}</p>
    <RouterLink :to="{ name: 'accounts', params: { tenant: runtime.tenant } }">{{
      t('operations.identityAccounts')
    }}</RouterLink>
    ·
    <RouterLink :to="{ name: 'providers', params: { tenant: runtime.tenant } }">{{
      t('operations.identityProviders')
    }}</RouterLink>
    ·
    <RouterLink :to="{ name: 'device-groups', params: { tenant: runtime.tenant } }">{{
      t('devices.groups')
    }}</RouterLink>
    <UiTabs
      v-model="section"
      :label="t('operations.organization')"
      :items="[
        { value: 'groups', label: t('operations.groupEditor') },
        { value: 'departments', label: t('operations.departments') },
        { value: 'delegations', label: t('operations.delegations') },
      ]"
      keep-mounted
      ><template #groups>
        <div class="console-inline-actions">
          <UiButton :disabled="!!busy" type="submit" @click="load()">{{
            t('devices.reload')
          }}</UiButton
          ><UiButton :disabled="!!(busy || uncertain)" type="submit" @click="beginCreate()">
            {{ t('operations.newGroup') }}
          </UiButton>
        </div>
        <p v-if="page && !page.items.length">{{ t('operations.empty') }}</p>
        <ul class="console-object-list">
          <li v-for="item in page?.items" :key="item.id">
            <UiButton
              v-if="item.value"
              :disabled="!!(busy || uncertain)"
              type="submit"
              @click="open(item.id)"
            >
              {{ item.value.name }} · {{ item.value.memberCount }}</UiButton
            ><span v-else>{{ item.id }} · {{ t('operations.deleted') }}</span> · {{ item.revision }}
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
        <p v-if="deleted">{{ t('operations.deleted') }} · {{ id }} / {{ revision }}</p>
        <details
          class="console-panel console-task"
          :open="editorOpen || uncertain || undefined"
          @toggle="editorOpen = ($event.target as HTMLDetailsElement).open"
        >
          <summary>{{ t('console.edit') }}</summary>
          <form @submit.prevent="save()">
            <fieldset :disabled="busy || uncertain || deleted || missing">
              <legend>{{ t('operations.groupEditor') }} · {{ id }} / {{ revision }}</legend>
              <label
                >{{ t('operations.name')
                }}<input v-model="draft.name" class="ui-input" data-testid="group-name" required
              /></label>
              <label
                ><input v-model="draft.enabled" type="checkbox" />{{
                  t('operations.enabled')
                }}</label
              >
              <label
                >{{ t('operations.principal')
                }}<input v-model="member" class="ui-input" data-testid="group-member"
              /></label>
              <UiButton type="button" data-testid="add-member" @click="add()">
                {{ t('operations.addMember') }}
              </UiButton>
              <ul>
                <li v-for="(value, index) in draft.members" :key="value.principalId">
                  {{ value.principalId
                  }}<UiButton type="button" @click="draft.members.splice(index, 1)">
                    {{ t('operations.removeMember') }}
                  </UiButton>
                </li>
              </ul>
              <p>{{ t('operations.authorityWarning') }}</p>
              <UiButton data-testid="save-group" :disabled="!!conflict" type="submit">
                {{ t('devices.save') }}
              </UiButton>
              <UiButton
                v-if="editing"
                type="button"
                :disabled="!!conflict"
                @click="confirmingAction = 'delete'"
              >
                {{ t('operations.delete') }}
              </UiButton>
            </fieldset>
          </form>
        </details>
        <UiButton v-if="editing" :disabled="!!busy" type="submit" @click="open(id, false)">
          {{ t('operations.compare') }}
        </UiButton>
        <section v-if="remoteRevision !== undefined" class="console-panel">
          <h2>{{ t('operations.remote') }}</h2>
          <p>
            {{ remote?.name ?? t('operations.deleted') }} / {{ remoteRevision }} ·
            {{ remote?.members.length ?? 0 }}
          </p>
          <UiButton v-if="remote" :disabled="!!(busy || uncertain)" type="submit" @click="adopt()">
            {{ t('operations.adoptRevision') }}
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
        </UiButton> </template
      ><template #departments>
        <h2>{{ t('operations.departments') }}</h2>
        <UiButton
          :disabled="!!busy"
          type="submit"
          @click="
            run(
              () => client.departments(),
              (v) => (department = v),
            )
          "
        >
          {{ t('devices.reload') }}
        </UiButton>
        <p v-if="department">{{ department.status }} · {{ t('operations.departmentHint') }}</p>
        <ul v-if="department?.status === 'available'">
          <li v-for="node in department.snapshot?.nodes" :key="node.id">
            {{ node.displayName }} · {{ node.id }} / {{ node.parentId ?? '—' }}
          </li>
        </ul>
        <p v-if="department?.status === 'available'">
          {{ department.source?.issuer }} · {{ utc(department.observedAt!) }} —
          {{ utc(department.expiresAt!) }} ·
          {{ department.snapshotId }}
        </p> </template
      ><template #delegations>
        <h2>{{ t('operations.delegations') }}</h2>
        <p>{{ t('operations.delegationHint') }}</p>
        <UiButton
          :disabled="!!busy"
          type="submit"
          @click="
            run(
              () => runtime.operations.admin.delegations(),
              (v) => (delegations = v),
            )
          "
        >
          {{ t('devices.reload') }}
        </UiButton>
        <ul>
          <li v-for="item in delegations?.items" :key="item.id">
            {{ item.principal }} · {{ item.department }} / {{ item.matching }} · {{ item.state }}
          </li>
        </ul>
        <UiButton
          v-if="delegations?.nextCursor"
          :disabled="!!busy"
          type="submit"
          @click="
            run(
              () => runtime.operations.admin.delegations(delegations!.nextCursor!),
              (v) => (delegations = v),
            )
          "
        >
          {{ t('devices.next') }}
        </UiButton>
      </template></UiTabs
    >
    <UiDialog
      :open="!!confirmingAction"
      :title="t('console.review')"
      :description="t('console.scopeBound')"
      :close-label="t('console.close')"
      kind="alertdialog"
      @update:open="!$event && (confirmingAction = undefined)"
      ><p>{{ draft.name }} · {{ draft.members.length }}</p>
      <p>{{ t('operations.authorityWarning') }}</p>
      <p>{{ confirmingAction ? t(`console.confirmActions.${confirmingAction}`) : '' }}</p>
      <template #footer
        ><UiButton :disabled="busy || uncertain" @click="confirmAction">{{
          t('identity.confirm')
        }}</UiButton></template
      ></UiDialog
    ></PageFrame
  >
</template>
