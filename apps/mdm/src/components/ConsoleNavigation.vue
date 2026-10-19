<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../context'
import { navigation, platformNavigation, detailParents } from './navigation'
defineProps<{ collapsed?: boolean; canManageAgent: boolean }>()
const emit = defineEmits<{ navigate: [] }>()
const { t } = useI18n(),
  route = useRoute(),
  runtime = useMdm()
const sections = computed(() => (runtime.realm === 'platform' ? platformNavigation : navigation))
const active = computed(() => detailParents[String(route.name)] ?? String(route.name))
const group = computed(
  () =>
    sections.value.find((section) => section.items.some((item) => item.name === active.value))?.id,
)
</script>
<template>
  <nav
    class="console-navigation"
    :class="{ 'is-collapsed': collapsed }"
    :aria-label="t('console.navigation')"
  >
    <RouterLink
      class="console-nav-primary"
      :to="{ name: 'workspace', params: { tenant: runtime.tenant } }"
      :title="t('console.overview')"
      @click="emit('navigate')"
      ><span class="console-nav-symbol" aria-hidden="true">◫</span
      ><span class="console-nav-label">{{ t('console.overview') }}</span></RouterLink
    >
    <div v-for="section in sections" :key="section.id" class="console-nav-section">
      <RouterLink
        class="console-nav-primary"
        :class="{ 'is-current': group === section.id }"
        :title="t(section.label)"
        :to="{ name: section.items[0].name, params: { tenant: runtime.tenant } }"
        @click="emit('navigate')"
        ><span class="console-nav-symbol" aria-hidden="true">{{
          section.id === 'settings' ? '⚙' : '⊞'
        }}</span
        ><span class="console-nav-label">{{ t(section.label) }}</span></RouterLink
      >
      <div v-if="group === section.id && !collapsed" class="console-nav-children">
        <template v-for="item in section.items.slice(1)" :key="item.name"
          ><RouterLink
            v-if="item.name !== 'agent-configurations' || canManageAgent"
            :to="{ name: item.name, params: { tenant: runtime.tenant } }"
            @click="emit('navigate')"
            >{{ t(item.label) }}</RouterLink
          ></template
        >
      </div>
    </div>
    <div v-if="!collapsed && runtime.realm === 'tenant'" class="console-nav-footer">
      <RouterLink
        :to="{ name: 'operations-approvals', params: { tenant: runtime.tenant } }"
        @click="emit('navigate')"
        >{{ t('operations.approvals') }}</RouterLink
      ><RouterLink
        :to="{ name: 'operations-audit', params: { tenant: runtime.tenant } }"
        @click="emit('navigate')"
        >{{ t('operations.audit') }}</RouterLink
      ><RouterLink
        :to="{ name: 'self-enrollments', params: { tenant: runtime.tenant } }"
        @click="emit('navigate')"
        >{{ t('registration.self') }}</RouterLink
      >
    </div>
    <a :href="runtime.realm === 'platform' ? '/' : '/platform'">{{
      t(runtime.realm === 'platform' ? 'settings.businessEntry' : 'settings.platform')
    }}</a>
  </nav>
</template>
