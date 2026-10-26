<script setup lang="ts">
import {
  VBtn,
  VDialog,
  VCard,
  VCardText,
  VCardActions,
  VTextField,
  VCheckbox,
  VTable,
  VAlert,
} from 'vuetify/components'
import { onMounted, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { user, type UserGroup } from '../../operations/clients/authorization'
import MdmPage from '../../../ui/MdmPage.vue'
import TenantUserSelect from './TenantUserSelect.vue'
import { groupMessages } from '../group-i18n'
const confirmingAction = ref<'delete'>()
function confirmAction() {
  const action = confirmingAction.value
  confirmingAction.value = undefined
  if (action === 'delete') save(true)
}
const editorOpen = ref(false)
function beginCreate() {
  if (busy.value || uncertain.value) return
  create()
  editorOpen.value = true
}
const { t } = useI18n({ useScope: 'local', messages: groupMessages }),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.operations.authorization,
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const page = ref<Awaited<ReturnType<typeof client.groups>>>(),
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
  page.value = undefined
  await run(
    () => client.groups({ cursor: after }),
    (v) => (page.value = v),
  )
}
async function open(group: string, replace = true) {
  if (busy.value || uncertain.value) return
  if (replace) {
    editorOpen.value = false
    draft.value = fresh()
  }
  await run(
    async () => {
      const detail = await client.group(group)
      return { definition: detail.value, revision: detail.revision }
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
  if (route.query['kind'] !== 'delegation' && typeof route.query['id'] === 'string')
    await open(route.query['id'])
}

watch(
  () => JSON.stringify(deviceBinding(runtime)),
  () => {
    page.value = undefined
    editorOpen.value = false
    draft.value = fresh()
    effective.value = undefined
    remote.value = undefined
    pending = undefined
  },
  { flush: 'sync' },
)
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
  <MdmPage
    :title="t('groupModule.user-static')"
    :description="t('groupModule.userBoundary')"
    :busy="busy"
    :failure="failure"
  >
    <template #actions
      ><v-btn :disabled="busy" variant="outlined" @click="load()">{{ t('devices.reload') }}</v-btn
      ><v-btn :disabled="busy || uncertain" color="primary" @click="beginCreate()">{{
        t('operations.newGroup')
      }}</v-btn></template
    >
    <v-table :aria-label="t('groupModule.user-static')"
      ><thead>
        <tr>
          <th>{{ t('operations.name') }}</th>
          <th>{{ t('operations.enabled') }}</th>
          <th>{{ t('devices.memberCount') }}</th>
          <th>{{ t('devices.revision') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in page?.items" :key="item.id">
          <td>
            <v-btn
              v-if="item.value"
              :disabled="busy || uncertain"
              variant="text"
              @click="open(item.id)"
              >{{ item.value.name }}</v-btn
            ><span v-else>{{ item.id }} · {{ t('operations.deleted') }}</span>
          </td>
          <td>{{ item.value ? t('devices.' + (item.value.enabled ? 'yes' : 'no')) : '—' }}</td>
          <td>{{ item.value?.memberCount ?? '—' }}</td>
          <td>{{ item.revision }}</td>
        </tr>
        <tr v-if="page && !page.items.length">
          <td colspan="4">{{ t('operations.empty') }}</td>
        </tr>
      </tbody></v-table
    >
    <v-btn v-if="page?.nextCursor" :disabled="busy" @click="load(page.nextCursor)">{{
      t('devices.next')
    }}</v-btn>
    <v-dialog
      :model-value="editorOpen || uncertain"
      max-width="800"
      scrollable
      :persistent="busy || uncertain"
      @update:model-value="editorOpen = $event"
      ><v-card :title="t('operations.groupEditor')"
        ><v-card-text>
          <p>{{ id }} / {{ revision }}</p>
          <v-alert v-if="failure" type="error" variant="tonal">{{
            t('devices.' + failure)
          }}</v-alert
          ><v-alert v-if="deleted" type="info" variant="tonal">{{
            t('operations.deleted')
          }}</v-alert>
          <form @submit.prevent="save()">
            <fieldset :disabled="busy || uncertain || deleted || missing">
              <v-text-field
                v-model="draft.name"
                data-testid="group-name"
                :label="t('operations.name')"
                required
                maxlength="256"
              /><v-checkbox v-model="draft.enabled" :label="t('operations.enabled')" />
              <TenantUserSelect v-model="member" :disabled="busy || uncertain || conflict" /><v-btn
                type="button"
                data-testid="add-member"
                :disabled="!member || !effective"
                @click="add()"
                >{{ t('operations.addMember') }}</v-btn
              >
              <v-table
                ><thead>
                  <tr>
                    <th>{{ t('operations.principal') }}</th>
                    <th>{{ t('devices.members') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(value, index) in draft.members" :key="value.principalId">
                    <td>{{ value.principalId }}</td>
                    <td>
                      <v-btn type="button" @click="draft.members.splice(index, 1)">{{
                        t('operations.removeMember')
                      }}</v-btn>
                    </td>
                  </tr>
                </tbody></v-table
              >
              <p>{{ t('operations.authorityWarning') }}</p>
              <v-btn data-testid="save-group" :disabled="conflict" type="submit" color="primary">{{
                t('devices.save')
              }}</v-btn
              ><v-btn
                v-if="editing"
                type="button"
                :disabled="conflict"
                @click="confirmingAction = 'delete'"
                >{{ t('operations.delete') }}</v-btn
              >
            </fieldset>
          </form>
          <v-btn v-if="editing" :disabled="busy" @click="open(id, false)">{{
            t('operations.compare')
          }}</v-btn>
          <v-alert v-if="remoteRevision !== undefined" type="info" variant="tonal"
            ><h3>{{ t('operations.remote') }}</h3>
            <p>
              {{ remote?.name ?? t('operations.deleted') }} / {{ remoteRevision }} ·
              {{ remote?.members.length ?? 0 }}
            </p>
            <v-btn v-if="remote" :disabled="busy || uncertain" @click="adopt()">{{
              t('operations.adoptRevision')
            }}</v-btn></v-alert
          >
          <v-btn
            v-if="uncertain && pending"
            data-testid="replay-write"
            :disabled="busy"
            @click="pending()"
            >{{ t('policies.replay') }}</v-btn
          > </v-card-text
        ><v-card-actions
          ><v-btn :disabled="busy || uncertain" @click="editorOpen = false">{{
            t('console.close')
          }}</v-btn></v-card-actions
        ></v-card
      ></v-dialog
    >
    <v-dialog
      :model-value="!!confirmingAction"
      role="alertdialog"
      max-width="560"
      :persistent="busy || uncertain"
      @update:model-value="!$event && (confirmingAction = undefined)"
      ><v-card :title="t('console.review')"
        ><v-card-text
          ><p>{{ draft.name }} · {{ draft.members.length }}</p>
          <p>{{ t('operations.authorityWarning') }}</p>
          <p>
            {{ confirmingAction ? t('console.confirmActions.' + confirmingAction) : '' }}
          </p></v-card-text
        ><v-card-actions
          ><v-btn :disabled="busy || uncertain" @click="confirmingAction = undefined">{{
            t('console.cancel')
          }}</v-btn
          ><v-btn :disabled="busy || uncertain" color="error" @click="confirmAction">{{
            t('identity.confirm')
          }}</v-btn></v-card-actions
        ></v-card
      ></v-dialog
    >
  </MdmPage>
</template>
