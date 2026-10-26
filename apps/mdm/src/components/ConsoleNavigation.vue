<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../context'
import {
  useNavigation,
  platformNavigation,
  detailParents,
  navigationTarget,
  type NavigationItem,
} from './navigation'
defineProps<{ collapsed?: boolean; canManageAgent: boolean }>()
const emit = defineEmits<{ navigate: [] }>()
const { t } = useI18n(),
  route = useRoute(),
  runtime = useMdm(),
  navigation = useNavigation()
const sections = computed(() => (runtime.realm === 'platform' ? platformNavigation : navigation))
const active = computed(() => detailParents[String(route.name)] ?? String(route.name))
const group = computed(
  () => sections.value.find((s) => s.items.some((x) => x.name === active.value))?.id,
)
function selected(item: NavigationItem) {
  return (
    item.name === active.value &&
    (!item.query || Object.entries(item.query).every(([key, value]) => route.query[key] === value))
  )
}
</script>
<template>
  <nav :aria-label="t('console.navigation')" class="mdm-navigation">
    <v-list nav density="compact">
      <v-list-item
        :to="{ name: 'workspace', params: { tenant: runtime.tenant } }"
        :title="t('console.overview')"
        @click="emit('navigate')"
      />
      <template v-for="section in sections" :key="section.id">
        <v-list-item
          :to="navigationTarget(section.items[0]!, runtime.tenant)"
          :title="t(section.label)"
          :active="group === section.id"
          @click="emit('navigate')"
        />
        <div v-if="group === section.id && !collapsed" class="mdm-navigation-children">
          <v-list-item
            v-for="item in section.id === 'groups' ? section.items : section.items.slice(1)"
            :key="item.name + JSON.stringify(item.query)"
            :to="navigationTarget(item, runtime.tenant)"
            :title="t(item.label)"
            :active="selected(item)"
            @click="emit('navigate')"
          />
        </div>
      </template>
      <v-divider class="my-4" />
      <v-list-item
        v-if="runtime.realm === 'tenant'"
        :to="{ name: 'self-enrollments' }"
        :title="t('registration.self')"
        @click="emit('navigate')"
      />
    </v-list>
  </nav>
</template>
