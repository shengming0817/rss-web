<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import PolicyFrame from '../components/PolicyFrame.vue'
import ExecutionFacts from '../components/ExecutionFacts.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  { run, busy, failure } = useOperation()
const batch = ref(typeof route.query['batch'] === 'string' ? route.query['batch'] : ''),
  page = ref<Awaited<ReturnType<typeof runtime.policies.executions.list>>>()
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
