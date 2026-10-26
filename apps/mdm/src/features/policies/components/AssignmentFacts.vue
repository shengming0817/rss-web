<script setup lang="ts">
import PolicyDialog from './PolicyDialog.vue'

import { VChip, VBtn } from 'vuetify/components'

import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ObjectLink from '../../devices/components/ObjectLink.vue'
import type {
  objectRef,
  primaryRegistration,
  deviceObject,
  Channel,
} from '../../devices/clients/objects'
defineProps<{
  item: {
    object: ReturnType<typeof objectRef>
    channel: Channel | null
    availability: string
    reason: string | null
    target: ReturnType<typeof primaryRegistration> | null
    sources?: ReturnType<typeof deviceObject>[]
  }
}>()
const { t, te } = useI18n(),
  evidenceOpen = ref(false)
</script>
<template>
  <div class="assignment-summary">
    <ObjectLink :object="item.object" /><span v-if="item.channel" class="ui-help">{{
      item.channel === 'agent' ? 'Agent' : 'MDM'
    }}</span
    ><VChip
      v-if="item.availability"
      :tone="item.availability === 'ready' ? 'success' : 'warning'"
      >{{ t(`policies.availability_${item.availability}`) }}</VChip
    ><span v-if="item.reason">{{
      te(`policies.assignmentReason.${item.reason}`)
        ? t(`policies.assignmentReason.${item.reason}`)
        : item.reason
    }}</span
    ><VBtn variant="text" @click="evidenceOpen = true">{{ t('devices.evidence') }}</VBtn>
  </div>
  <PolicyDialog
    v-model:open="evidenceOpen"
    placement="right"
    :title="t('devices.evidence')"
    :close-label="t('console.close')"
  >
    <ObjectLink :object="item.object" />
    <p v-if="item.target">
      {{ t('devices.registration') }}: {{ item.target.device }} / {{ item.target.registrationId }} /
      {{ item.target.generation }}
    </p>
    <section
      v-for="source in item.sources ?? []"
      :key="`${source.object.kind}:${source.object.id}`"
      class="console-panel"
    >
      <ObjectLink :object="source.object" />
      <p>
        {{ t('devices.revision') }} {{ source.associationVersion ?? '—' }} ·
        {{ t(source.verified ? 'devices.yes' : 'devices.no') }}
      </p>
      <dl v-for="member in source.members" :key="member.registrationId">
        <dt>{{ member.channel === 'agent' ? 'Agent' : 'MDM' }}</dt>
        <dd>{{ member.device }}</dd>
        <dt>{{ t('devices.registration') }}</dt>
        <dd class="coordinate">{{ member.registrationId }} / {{ member.generation }}</dd>
      </dl>
    </section>
  </PolicyDialog>
</template>
