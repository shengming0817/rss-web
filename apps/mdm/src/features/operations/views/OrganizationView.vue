<script setup lang="ts">
import { utc } from '../presentation'
import { onMounted, ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { user, type UserGroup } from '../clients/authorization'
import OperationsFrame from '../components/OperationsFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
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
  remote = ref<UserGroup>(),
  remoteRevision = ref<number>(),
  editing = ref(false),
  conflict = ref(false)
let pending: (() => Promise<boolean>) | undefined
async function load(after?: string) {
  await run(
    () => client.groups(after),
    (v) => (page.value = v),
  )
}
async function open(group: string, expected: number, replace = true) {
  await run(
    async () => {
      let next: string | undefined,
        summary: NonNullable<typeof page.value>['items'][number] | undefined
      do {
        const p = await client.groups(next)
        summary = p.items.find((v) => v.id === group)
        next = p.nextCursor ?? undefined
      } while (!summary && next)
      if (!summary?.value) throw new Error('Group not found')
      if (replace && summary.revision !== expected) throw new Error('Group changed')
      const members = await client.allMembers(group, summary.revision)
      if (members.length !== summary.value.memberCount) throw new Error('Incomplete membership')
      return {
        definition: { name: summary.value.name, enabled: summary.value.enabled, members },
        revision: summary.revision,
      }
    },
    (v) => {
      if (replace) {
        id.value = group
        revision.value = v.revision
        draft.value = v.definition
        editing.value = true
        remote.value = undefined
        remoteRevision.value = undefined
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
  if (busy.value || uncertain.value || conflict.value) return
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
onMounted(async () => {
  await run(
    () => client.effective(),
    (v) => (effective.value = v),
  )
  await load()
})
</script>
<template>
  <OperationsFrame :title="t('operations.organization')" :busy="busy" :failure="failure">
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
    <div class="device-actions">
      <button :disabled="busy" @click="load()">{{ t('devices.reload') }}</button
      ><button :disabled="busy || uncertain" @click="create()">
        {{ t('operations.newGroup') }}
      </button>
    </div>
    <p v-if="page && !page.items.length">{{ t('operations.empty') }}</p>
    <ul>
      <li v-for="item in page?.items" :key="item.id">
        <button
          v-if="item.value"
          :disabled="busy || uncertain"
          @click="open(item.id, item.revision)"
        >
          {{ item.value.name }} · {{ item.value.memberCount }}</button
        ><span v-else>{{ item.id }} · {{ t('operations.deleted') }}</span> · {{ item.revision }}
      </li>
    </ul>
    <button v-if="page?.nextCursor" :disabled="busy" @click="load(page.nextCursor)">
      {{ t('devices.next') }}
    </button>
    <form @submit.prevent="save()">
      <fieldset :disabled="busy || uncertain">
        <legend>{{ t('operations.groupEditor') }} · {{ id }} / {{ revision }}</legend>
        <label
          >{{ t('operations.name') }}<input v-model="draft.name" data-testid="group-name" required
        /></label>
        <label
          ><input v-model="draft.enabled" type="checkbox" />{{ t('operations.enabled') }}</label
        >
        <label
          >{{ t('operations.principal') }}<input v-model="member" data-testid="group-member"
        /></label>
        <button type="button" data-testid="add-member" @click="add()">
          {{ t('operations.addMember') }}
        </button>
        <ul>
          <li v-for="(value, index) in draft.members" :key="value.principalId">
            {{ value.principalId
            }}<button type="button" @click="draft.members.splice(index, 1)">
              {{ t('operations.removeMember') }}
            </button>
          </li>
        </ul>
        <p>{{ t('operations.authorityWarning') }}</p>
        <button data-testid="save-group" :disabled="conflict">
          {{ t('devices.save') }}
        </button>
        <button v-if="editing" type="button" :disabled="conflict" @click="save(true)">
          {{ t('operations.delete') }}
        </button>
      </fieldset>
    </form>
    <button v-if="editing" :disabled="busy" @click="open(id, revision, false)">
      {{ t('operations.compare') }}
    </button>
    <section v-if="remote">
      <h2>{{ t('operations.remote') }}</h2>
      <p>{{ remote.name }} / {{ remoteRevision }} · {{ remote.members.length }}</p>
      <button :disabled="busy || uncertain" @click="adopt()">
        {{ t('operations.adoptRevision') }}
      </button>
    </section>
    <button
      v-if="uncertain && pending"
      data-testid="replay-write"
      :disabled="busy"
      @click="pending()"
    >
      {{ t('policies.replay') }}
    </button>
    <h2>{{ t('operations.departments') }}</h2>
    <button
      :disabled="busy"
      @click="
        run(
          () => client.departments(),
          (v) => (department = v),
        )
      "
    >
      {{ t('devices.reload') }}
    </button>
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
    </p>
    <h2>{{ t('operations.delegations') }}</h2>
    <p>{{ t('operations.delegationHint') }}</p>
    <button
      :disabled="busy"
      @click="
        run(
          () => runtime.operations.admin.delegations(),
          (v) => (delegations = v),
        )
      "
    >
      {{ t('devices.reload') }}
    </button>
    <ul>
      <li v-for="item in delegations?.items" :key="item.id">
        {{ item.principal }} · {{ item.department }} / {{ item.matching }} · {{ item.state }}
      </li>
    </ul>
    <button
      v-if="delegations?.nextCursor"
      :disabled="busy"
      @click="
        run(
          () => runtime.operations.admin.delegations(delegations!.nextCursor!),
          (v) => (delegations = v),
        )
      "
    >
      {{ t('devices.next') }}
    </button>
  </OperationsFrame>
</template>
