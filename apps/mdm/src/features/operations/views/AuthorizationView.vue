<script setup lang="ts">
import { onMounted, ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import {
  grant,
  permissions,
  devicePermissions,
  rule,
  type Rule,
  type Grant,
  type Subject,
} from '../clients/authorization'
import OperationsFrame from '../components/OperationsFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.operations.authorization,
  route = useRoute(),
  { run, runWrite, busy, failure, uncertain } = useOperation()
const page = ref<Awaited<ReturnType<typeof client.rules>>>(),
  effective = ref<Awaited<ReturnType<typeof client.effective>>>(),
  id = ref<string>(crypto.randomUUID()),
  revision = ref(0),
  kind = ref<Subject['kind']>('user'),
  subjectId = ref(''),
  provider = ref(''),
  issuer = ref(''),
  configurationVersion = ref(1),
  matching = ref('exact'),
  permission = ref<Grant['operation']>('inventory_read'),
  scope = ref('all_devices'),
  device = ref(''),
  grants = ref<Grant[]>([]),
  remote = ref<Rule | null>(),
  remoteRevision = ref<number>(),
  confirm = ref(false),
  conflict = ref(false)
let pending: (() => Promise<boolean>) | undefined
async function load(after?: string) {
  await run(
    () => client.rules(after),
    (v) => (page.value = v),
  )
}
function fill(value: Rule, target: string, rev: number) {
  if (uncertain.value) return
  id.value = target
  revision.value = rev
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
  confirm.value = false
  conflict.value = false
  remote.value = undefined
  remoteRevision.value = undefined
}
function create() {
  if (busy.value || uncertain.value) return
  id.value = crypto.randomUUID()
  revision.value = 0
  grants.value = []
  subjectId.value = ''
  confirm.value = false
  conflict.value = false
  remote.value = undefined
  remoteRevision.value = undefined
  pending = undefined
}
function definition(): Rule {
  const s =
    kind.value === 'user'
      ? {
          kind: 'user',
          user: {
            instanceId: effective.value!.instanceId,
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
  return rule(
    {
      subject: s,
      grants: grants.value.length
        ? grants.value
        : [
            {
              operation: permission.value,
              scope:
                scope.value === 'device'
                  ? { kind: 'device', id: device.value }
                  : { kind: scope.value },
            },
          ],
    },
    runtime.tenant,
  )
}
function addGrant() {
  try {
    const g = grant({
      operation: permission.value,
      scope:
        scope.value === 'device' ? { kind: 'device', id: device.value } : { kind: scope.value },
    })
    if (!grants.value.some((x) => JSON.stringify(x) === JSON.stringify(g))) grants.value.push(g)
  } catch {
    failure.value = 'invalidRequest'
  }
}
function save(remove = false) {
  if (busy.value || uncertain.value || conflict.value || (revision.value > 0 && !confirm.value))
    return
  try {
    const target = id.value,
      body = {
        operationId: crypto.randomUUID(),
        expectedRevision: revision.value,
        value: remove ? null : definition(),
      }
    pending = async () => {
      const saved = await runWrite(
        () => client.changeRule(target, body),
        (v) => {
          revision.value = v.revision
          confirm.value = false
          if (v.deleted) {
            id.value = crypto.randomUUID()
            revision.value = 0
            grants.value = []
            subjectId.value = ''
          }
        },
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
async function compare() {
  await run(
    async () => {
      let after: string | undefined
      do {
        const p = await client.rules(after),
          item = p.items.find((v) => v.id === id.value)
        if (item) return item
        after = p.nextCursor ?? undefined
      } while (after)
      throw new Error('Rule absent')
    },
    (v) => {
      remote.value = v.value
      remoteRevision.value = v.revision
    },
  )
}
function adopt() {
  if (remoteRevision.value === undefined) return
  revision.value = remoteRevision.value
  remoteRevision.value = undefined
  conflict.value = false
  failure.value = null
}
onMounted(async () => {
  await run(
    () => client.effective(),
    (v) => (effective.value = v),
  )
  await load()
  if (typeof route.query['id'] === 'string') {
    const item = page.value?.items.find((v) => v.id === route.query['id'])
    if (item?.value) fill(item.value, item.id, item.revision)
  }
})
</script>
<template>
  <OperationsFrame :title="t('operations.authorization')" :busy="busy" :failure="failure">
    <p>{{ t('operations.authorityWarning') }}</p>
    <button :disabled="busy" @click="load()">{{ t('devices.reload') }}</button
    ><button :disabled="busy || uncertain" @click="create()">{{ t('operations.newRule') }}</button>
    <ul>
      <li v-for="item in page?.items" :key="item.id">
        <button
          v-if="item.value"
          :disabled="busy || uncertain"
          @click="fill(item.value, item.id, item.revision)"
        >
          {{ item.id }} / {{ item.revision }} · {{ item.value.subject.kind }}</button
        ><span v-else>{{ item.id }} · {{ t('operations.deleted') }}</span>
      </li>
    </ul>
    <button v-if="page?.nextCursor" :disabled="busy" @click="load(page.nextCursor)">
      {{ t('devices.next') }}
    </button>
    <form @submit.prevent="save()">
      <fieldset :disabled="busy || uncertain || !effective">
        <legend>{{ t('operations.ruleEditor') }} · {{ id }} / {{ revision }}</legend>
        <label
          >{{ t('operations.subject')
          }}<select v-model="kind">
            <option v-for="value in ['user', 'user_group', 'department', 'idp_group']" :key="value">
              {{ value }}
            </option>
          </select></label
        >
        <label
          >{{ t('operations.subjectId')
          }}<input v-model="subjectId" data-testid="subject-id" required
        /></label>
        <template v-if="kind === 'department' || kind === 'idp_group'"
          ><label>{{ t('operations.provider') }}<input v-model="provider" required /></label
          ><label>{{ t('operations.issuer') }}<input v-model="issuer" required /></label
          ><label
            >{{ t('operations.sourceVersion')
            }}<input v-model.number="configurationVersion" type="number" min="1" required /></label
        ></template>
        <label v-if="kind === 'department'"
          >{{ t('operations.matching')
          }}<select v-model="matching">
            <option>exact</option>
            <option>subtree</option>
          </select></label
        >
        <label
          >{{ t('operations.permission')
          }}<select
            v-model="permission"
            @change="
              scope = (devicePermissions as readonly string[]).includes(permission)
                ? 'all_devices'
                : 'tenant'
            "
          >
            <option v-for="value in permissions" :key="value">{{ value }}</option>
          </select></label
        >
        <label
          >{{ t('operations.scope')
          }}<select v-model="scope">
            <option
              v-for="value in (devicePermissions as readonly string[]).includes(permission)
                ? ['all_devices', 'device']
                : ['tenant']"
              :key="value"
            >
              {{ value }}
            </option>
          </select></label
        >
        <label v-if="scope === 'device'"
          >{{ t('policies.device') }}<input v-model="device" required
        /></label>
        <button type="button" @click="addGrant()">{{ t('operations.addGrant') }}</button>
        <ul>
          <li v-for="(g, index) in grants" :key="index">
            {{ g.operation }} / {{ g.scope.kind
            }}<button type="button" @click="grants.splice(index, 1)">
              {{ t('operations.removeMember') }}
            </button>
          </li>
        </ul>
        <label v-if="revision > 0"
          ><input v-model="confirm" type="checkbox" />{{ t('operations.confirmAuthority') }}</label
        >
        <button data-testid="save-rule" :disabled="conflict || (revision > 0 && !confirm)">
          {{ t('devices.save') }}
        </button>
        <button
          v-if="revision > 0"
          type="button"
          :disabled="conflict || !confirm"
          @click="save(true)"
        >
          {{ t('operations.delete') }}
        </button>
      </fieldset>
    </form>
    <button v-if="revision > 0" :disabled="busy" @click="compare()">
      {{ t('operations.compare') }}
    </button>
    <p v-if="remoteRevision !== undefined">
      {{ t('operations.remote') }} · {{ remoteRevision }} ·
      {{ remote?.subject.kind ?? t('operations.deleted')
      }}<button :disabled="busy || uncertain" @click="adopt()">
        {{ t('operations.adoptRevision') }}
      </button>
    </p>
    <button
      v-if="uncertain && pending"
      data-testid="replay-write"
      :disabled="busy"
      @click="pending()"
    >
      {{ t('policies.replay') }}
    </button>
    <h2>{{ t('operations.effective') }}</h2>
    <button
      :disabled="busy"
      @click="
        run(
          () => client.effective(),
          (v) => (effective = v),
        )
      "
    >
      {{ t('devices.reload') }}
    </button>
    <ul>
      <li v-for="(g, index) in effective?.grants" :key="index">
        {{ g.operation }} / {{ g.scope.kind }} · {{ g.ruleId }} / {{ g.ruleRevision }} ·
        {{ g.observation?.snapshotId ?? '—' }} · {{ g.observation?.expiresAt ?? '—' }}
      </li>
    </ul>
  </OperationsFrame>
</template>
