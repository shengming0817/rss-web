<script setup lang="ts">
import { onMounted, ref, toRaw } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import type { NativeTask } from '../clients/native'
import PolicyFrame from '../components/PolicyFrame.vue'
import ExecutionFacts from '../components/ExecutionFacts.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  { run, runWrite, busy, failure, uncertain } = useOperation()
const batch = ref(typeof route.query['batch'] === 'string' ? route.query['batch'] : ''),
  page = ref<Awaited<ReturnType<typeof runtime.policies.executions.list>>>()
const device = ref(typeof route.query['device'] === 'string' ? route.query['device'] : ''),
  nativeTask = ref<NativeTask>({ kind: 'state_verify', field: 'model', expectedValue: '' }),
  deadline = ref(Math.floor(Date.now() / 1000) + 3600),
  accepted = ref<string>()
let pending: (() => Promise<boolean>) | undefined
function kind(event: Event) {
  const kind = (event.target as HTMLSelectElement).value
  nativeTask.value =
    kind === 'profile_install'
      ? { kind, enabled: true }
      : kind === 'profile_remove'
        ? { kind, profile: '' }
        : { kind: 'state_verify', field: 'model', expectedValue: '' }
}
function submit() {
  if (busy.value || uncertain.value) return
  const target = device.value,
    body = {
      operationId: crypto.randomUUID(),
      task: structuredClone(toRaw(nativeTask.value)),
      deadline: deadline.value,
    }
  pending = () =>
    runWrite(
      () => runtime.policies.native.create(target, body),
      (v) => (accepted.value = v.operationId),
    )
  void pending()
}
function load(cursor?: string) {
  void run(
    () => runtime.policies.executions.list(cursor, batch.value || undefined),
    (v) => (page.value = v),
  )
}
onMounted(() => load())
</script>
<template>
  <PolicyFrame :title="t('policies.executions')" :busy="busy" :failure="failure"
    ><form @submit.prevent="load()">
      <label for="execution-batch">{{ t('policies.batch') }}</label
      ><input id="execution-batch" v-model="batch" :disabled="busy" /><button :disabled="busy">
        {{ t('policies.reload') }}
      </button>
    </form>
    <details>
      <summary>{{ t('policies.nativeAction') }}</summary>
      <form @submit.prevent="submit">
        <fieldset :disabled="busy || uncertain">
          <label for="native-device">{{ t('policies.device') }}</label
          ><input id="native-device" v-model="device" required /><label for="native-kind">{{
            t('policies.kind')
          }}</label
          ><select id="native-kind" :value="nativeTask.kind" @change="kind">
            <option value="state_verify">{{ t('policies.stateVerify') }}</option>
            <option value="profile_install">{{ t('policies.profileInstall') }}</option>
            <option value="profile_remove">{{ t('policies.profileRemove') }}</option></select
          ><template v-if="nativeTask.kind === 'state_verify'"
            ><label for="native-field">{{ t('policies.field') }}</label
            ><select id="native-field" v-model="nativeTask.field">
              <option value="model">{{ t('policies.model') }}</option>
              <option value="os_version">{{ t('policies.osVersion') }}</option></select
            ><label for="native-value">{{ t('policies.expectedValue') }}</label
            ><input id="native-value" v-model="nativeTask.expectedValue" required /></template
          ><label v-else-if="nativeTask.kind === 'profile_install'"
            ><input v-model="nativeTask.enabled" type="checkbox" />{{
              t('policies.enabled')
            }}</label
          ><template v-else
            ><label for="native-profile">{{ t('policies.profileId') }}</label
            ><input id="native-profile" v-model="nativeTask.profile" required /></template
          ><label for="native-deadline">{{ t('policies.until') }}</label
          ><input
            id="native-deadline"
            v-model.number="deadline"
            type="number"
            min="1"
            required
          /><button type="submit">{{ t('policies.submitNative') }}</button>
        </fieldset>
      </form>
      <RouterLink
        v-if="accepted"
        :to="{ name: 'policy-execution', params: { tenant: runtime.tenant, execution: accepted } }"
        >{{ t('policies.detail') }} {{ accepted }}</RouterLink
      ><button v-if="uncertain && pending" :disabled="busy" @click="pending()">
        {{ t('policies.replay') }}
      </button>
    </details>
    <p v-if="page && !page.items.length">{{ t('policies.empty') }}</p>
    <article v-for="item in page?.items" :key="item.id">
      <h2>
        <RouterLink
          :to="{ name: 'policy-execution', params: { tenant: runtime.tenant, execution: item.id } }"
          >{{ item.device }} · {{ item.id }}</RouterLink
        >
      </h2>
      <ExecutionFacts :execution="item" />
    </article>
    <button v-if="page?.nextCursor" :disabled="busy" @click="load(page.nextCursor)">
      {{ t('policies.next') }}
    </button></PolicyFrame
  >
</template>
