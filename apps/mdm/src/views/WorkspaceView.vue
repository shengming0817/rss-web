<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { isRssApiError } from '@rss/api/mdm'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../context'
import { features } from '../features'
import { moduleIds, type Workspace } from '../services/workspace'
const { t } = useI18n()
const runtime = useMdm()
const data = ref<Workspace>()
const failed = ref<'unavailable' | 'queryDenied' | null>(null)
const busy = ref(false)
async function load() {
  if (busy.value) return
  busy.value = true
  failed.value = null
  data.value = undefined
  try {
    data.value = await runtime.workspace.read()
  } catch (error) {
    failed.value = isRssApiError(error) && error.status === 403 ? 'queryDenied' : 'unavailable'
  } finally {
    busy.value = false
  }
}
onMounted(load)
</script>
<template>
  <section aria-labelledby="workspace-title" :aria-busy="busy">
    <p class="identity-eyebrow">RSS MDM</p>
    <h1 id="workspace-title">{{ t('mdm.title') }}</h1>
    <p>{{ t('mdm.intro') }}</p>
    <p v-if="runtime.demo" class="mdm-source" role="status">{{ t('mdm.mock') }}</p>
    <p v-if="failed" role="alert">{{ t(`mdm.${failed}`) }}</p>
    <button :disabled="busy" @click="load">{{ t('mdm.reload') }}</button>
    <div class="mdm-grid">
      <article v-for="id in moduleIds" :key="id" class="identity-card">
        <h2>{{ t(`mdm.${id}`) }}</h2>
        <p>
          {{ t('mdm.source') }}:
          {{ t(`mdm.${data?.modules.find((m) => m.id === id)?.source ?? 'unknownSource'}`) }}
        </p>
        <p v-if="data?.modules.find((m) => m.id === id)?.available == null">
          {{ t('mdm.unknown') }}
        </p>
        <p v-else-if="!data?.modules.find((m) => m.id === id)?.available">{{ t('mdm.denied') }}</p>
        <RouterLink
          v-else-if="features[id]"
          :to="{
            name: features[id]!.entry.name,
            params: { tenant: runtime.tenant },
          }"
          >{{ t('mdm.open') }}</RouterLink
        >
        <p v-else>{{ t('mdm.planned') }}</p>
      </article>
    </div>
    <p>{{ t('mdm.boundary') }}</p>
  </section>
</template>
