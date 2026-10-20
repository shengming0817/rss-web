<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
import PageFrame from '../components/PageFrame.vue'
import { useMdm } from '../context'
import { useOperation } from '../services/useOperation'
const runtime = useMdm(),
  router = useRouter(),
  route = useRoute(),
  { t } = useI18n()
const { run, busy, failure } = useOperation()
async function enter() {
  await run(
    async () => {
      if (runtime.realm === 'platform') return 'settings-overview'
      const principal = runtime.session.state.value.identity?.principalId
      const authorization = await runtime.operations.authorization.effective()
      if (authorization.principalId !== principal) throw new Error('Wrong entry actor')
      const administrator = authorization.grants.some(
        (g) => g.operation === 'registration_configuration_write' && g.scope.kind === 'tenant',
      )
      if (!administrator) return 'workspace'
      if (route.query['operation'] !== undefined) return 'settings-guide'
      const progress = await runtime.settings.firstUse.read()
      return progress.saved.intent.completionRequested ? 'workspace' : 'settings-guide'
    },
    (name) => {
      void router.replace({
        name,
        params: { tenant: runtime.tenant },
        query: name === 'settings-guide' ? { operation: route.query['operation'] } : {},
      })
    },
  )
}
onMounted(enter)
</script>
<template>
  <PageFrame :title="t('settings.entryTitle')" :busy="busy" :failure="failure">
    <p>{{ t('settings.entryHint') }}</p>
    <UiButton v-if="failure" :busy="busy" @click="enter">{{ t('settings.reload') }}</UiButton>
  </PageFrame>
</template>
