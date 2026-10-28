<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDa } from '../context'
import Icon from '../ui/Icon.vue'
const props = defineProps<{ theme: string }>()
const emit = defineEmits<{ theme: [value: string] }>()
const r = useDa(),
  route = useRoute(),
  router = useRouter()
const links = [
  { path: '/', name: '访问总览', icon: 'overview' },
  { path: '/computers', name: '计算机', icon: 'devices' },
  { path: '/configurations', name: '登录配置', icon: 'policies' },
  { path: '/applications', name: '企业应用', icon: 'apps' },
  { path: '/audit', name: '审计活动', icon: 'audit' },
]
const title = computed(
  () =>
    links.find((l) => (l.path === '/' ? route.path === '/' : route.path.startsWith(l.path)))
      ?.name ?? '账户安全',
)
function toggleTheme() {
  emit('theme', props.theme === 'access' ? 'night' : 'access')
}
async function logout() {
  try {
    await r.session.logout()
  } catch {
    /* The session owner retains unconfirmed outcome. */
  }
  await router.replace({ name: 'sessions' })
}
</script>
<template>
  <div class="workspace">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-symbol"><Icon name="shield" /></span>
        <div><strong>Device Access</strong><span>RSS WORKSPACE</span></div>
      </div>
      <p class="nav-label">{{ $t('da.m1bf3defde7') }}</p>
      <nav :aria-label="$t('da.mfb1c7dc70a')">
        <router-link
          v-for="l in links"
          :key="l.path"
          :to="l.path"
          :aria-label="l.name"
          :class="[
            'nav-item',
            { active: l.path === '/' ? route.path === '/' : route.path.startsWith(l.path) },
          ]"
          ><Icon :name="l.icon" /><span>{{ l.name }}</span></router-link
        >
      </nav>
      <div class="sidebar-bottom">
        <div class="connection">
          <span class="live-dot" /><span>{{
            r.source === 'service' ? '服务接口' : '演示接口'
          }}</span
          ><small>{{
            r.source === 'service' ? '能力按实际授权读取' : '合成数据，不代表设备效果'
          }}</small>
        </div>
        <router-link to="/security" class="nav-item" :aria-label="$t('da.m59a0b9298e')"
          ><Icon name="user" /><span>{{ $t('da.m59a0b9298e') }}</span></router-link
        >
        <div class="profile">
          <span class="avatar">DA</span>
          <div>
            <strong>{{ $t('da.m0f0ff9138b') }}</strong
            ><span>{{
              r.session.state.value.status === 'authenticated' ? '已登录' : '未认证'
            }}</span>
          </div>
          <v-btn icon variant="text" size="small" :aria-label="$t('da.mdeed0285a9')" @click="logout"
            ><Icon name="logout"
          /></v-btn>
        </div>
      </div>
    </aside>
    <div class="main-shell">
      <header class="topbar">
        <span class="breadcrumb">RSS / {{ title }}</span>
        <div class="top-actions">
          <v-chip v-if="r.source === 'demo'" color="info">MOCK</v-chip
          ><v-btn
            icon
            variant="text"
            size="small"
            :aria-label="$t('da.m7ec7bb6442')"
            @click="toggleTheme"
            ><Icon name="moon"
          /></v-btn>
        </div>
      </header>
      <main class="content">
        <slot />
        <footer class="content-footer">
          <span>RSS Device Access</span><span>{{ $t('da.m7fb783b366') }}</span>
        </footer>
      </main>
    </div>
  </div>
</template>
