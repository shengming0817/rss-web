<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { controlKind, type NativeOperation } from '../clients/native'
const props = defineProps<{ operation: NativeOperation; device: string }>()
const { t } = useI18n(),
  control = computed(() => controlKind(props.operation.task))
</script>
<template>
  <section data-testid="native-task-facts">
    <h3>{{ control ? t(`policies.control_${control}`) : operation.task.name }}</h3>
    <dl>
      <dt>{{ t('policies.device') }}</dt>
      <dd>{{ device }}</dd>
      <dt>{{ t('policies.kind') }}</dt>
      <dd>
        {{ operation.task.name }} · {{ operation.target.kind
        }}{{ operation.target.kind === 'user' ? ` / ${operation.target.userId}` : '' }}
      </dd>
    </dl>
    <p v-if="control">{{ t(`policies.controlImpact.${control}`) }}</p>
    <ul>
      <li v-for="object in operation.task.objects" :key="object">{{ object }}</li>
    </ul>
  </section>
</template>
