<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { exactResource, resourceBinding } from '../clients/model'
import type { ResourceRead } from '../clients/resources'
import { softwareIdentity } from '../clients/software-definition'
const props = defineProps<{
  binding: ReturnType<typeof exactResource> | ReturnType<typeof resourceBinding>
}>()
const runtime = useMdm(),
  { t } = useI18n(),
  resource = ref<ResourceRead>(),
  failed = ref(false)
let generation = 0
watch(
  () => JSON.stringify(props.binding),
  async () => {
    const current = ++generation,
      binding = structuredClone(toRaw(props.binding))
    resource.value = undefined
    failed.value = false
    if (!binding.id || !binding.version) return
    try {
      const r = await runtime.policies.resources.read(binding.id)
      if (current === generation && r.id === binding.id) resource.value = r
    } catch {
      if (current === generation) failed.value = true
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  generation++
})
const rows = computed(() => {
  const b = props.binding,
    r = resource.value
  if (r?.id !== b.id) return []
  const variants = r.versions.find((v) => v.id === b.version)?.variants ?? []
  const selected = variants.filter((v) =>
    'variants' in b
      ? b.variants[`${v.platform}_${v.architecture}`] === v.key
      : v.key === b.variant && v.platform === b.platform && v.architecture === b.architecture,
  )
  return selected.flatMap((v) =>
    v.declaration.kind === 'script'
      ? [
          {
            key: `${v.platform}/${v.architecture}/${v.key}`,
            runAs: v.declaration.definition.runAs,
            scope: null,
            deployment: null,
          },
        ]
      : v.declaration.kind === 'software'
        ? [
            {
              key: `${v.platform}/${v.architecture}/${v.key}`,
              ...softwareIdentity(v.declaration.definition),
            },
          ]
        : [],
  )
})
</script>
<template>
  <section :aria-label="t('policies.selfService.identity')" data-section="resource-identity">
    <p v-if="!rows.length" :role="failed ? 'alert' : 'status'">
      {{ t('policies.selfService.identityUnavailable') }}
    </p>
    <p v-for="row in rows" :key="row.key">
      {{ row.key }} · {{ t('policies.selfService.identity') }}:
      {{ t(`policies.selfService.identity_${row.runAs}`)
      }}<template v-if="row.scope">
        · {{ t('policies.selfService.installScope') }}:
        {{ t(`policies.selfService.scope_${row.scope}`) }}</template
      ><template v-if="row.deployment">
        · {{ t(`policies.selfService.deployment_${row.deployment}`) }}</template
      >
    </p>
    <p>{{ t('policies.selfService.identityHint') }}</p>
  </section>
</template>
