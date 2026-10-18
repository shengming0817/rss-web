<script setup lang="ts">
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
    channel: Channel
    availability: string
    reason: string | null
    target: ReturnType<typeof primaryRegistration> | null
    sources?: ReturnType<typeof deviceObject>[]
  }
}>()
const { t } = useI18n()
</script>
<template>
  <div>
    <ObjectLink :object="item.object" /> · {{ item.channel }} ·
    {{ t(`policies.availability_${item.availability}`)
    }}<span v-if="item.reason"> · {{ item.reason }}</span>
    <p v-if="item.target">
      {{ t('devices.registration') }}: {{ item.target.device }} / {{ item.target.registrationId }} /
      {{ item.target.generation }}
    </p>
    <ul v-if="item.sources?.length">
      <li v-for="source in item.sources" :key="`${source.object.kind}:${source.object.id}`">
        <ObjectLink :object="source.object" /> · {{ source.associationVersion ?? '—' }} ·
        {{ t(source.verified ? 'devices.yes' : 'devices.no') }}
        <ul>
          <li v-for="member in source.members" :key="member.registrationId">
            {{ member.device }} / {{ member.channel }} / {{ member.registrationId }} /
            {{ member.generation }}
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>
