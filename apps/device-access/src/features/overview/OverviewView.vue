<script setup lang="ts">
import { useRouter } from 'vue-router'
import Icon from '../../ui/Icon.vue'
import { useDa } from '../../context'
const r = useDa(),
  router = useRouter()
const areas = [
  {
    label: '计算机与账号',
    text: '资产归属、注册状态、Passkey 与恢复材料',
    path: '/computers',
    icon: 'devices',
  },
  {
    label: '登录配置',
    text: '按平台选择方式，分配范围并核对',
    path: '/configurations',
    icon: 'policies',
  },
  {
    label: '企业应用',
    text: '管理宿主已登记的 RP 与回跳配置',
    path: '/applications',
    icon: 'apps',
  },
]
</script>
<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">DEVICE ACCESS</p>
      <h1>{{ $t('da.ma38fbc56ca') }}</h1>
      <p class="muted">{{ $t('da.me0c8c78c67') }}</p>
    </div>
  </div>
  <section class="overview-hero">
    <div>
      <span class="section-kicker">{{ $t('da.m1bf3defde7') }}</span>
      <h2>{{ $t('da.m2f901c2ee1') }}</h2>
      <p>{{ $t('da.m495e365d17') }}<br />{{ $t('da.m817bd086d4') }}</p>
      <v-btn color="primary" @click="router.push('/computers')"
        >{{ $t('da.m2110e83cbb') }}<Icon name="arrow"
      /></v-btn>
    </div>
    <div class="hero-art" aria-hidden="true">
      <div class="orbit orbit-one" />
      <div class="orbit orbit-two" />
      <div class="art-center"><Icon name="shield" /></div>
    </div>
  </section>
  <div class="three-columns mt-6">
    <button
      v-for="a in areas"
      :key="a.path"
      class="panel explanatory overview-action"
      @click="router.push(a.path)"
    >
      <Icon :name="a.icon" />
      <h2>{{ a.label }}</h2>
      <p>{{ a.text }}</p>
    </button>
  </div>
  <section class="panel mt-6">
    <div class="panel-heading">
      <h2>{{ $t('da.mef8e1ef901') }}</h2>
      <v-chip>{{ r.source === 'demo' ? '明确的 mock HTTP 接口' : '当前服务接口' }}</v-chip>
    </div>
    <div class="contract-row">
      <strong>{{ $t('da.m09536c0665') }}</strong>
      <p>{{ $t('da.mdddb51139c') }}</p>
    </div>
    <div class="contract-row">
      <strong>{{ $t('da.m0c000bfa6d') }}</strong>
      <p>{{ $t('da.m642a122024') }}</p>
    </div>
  </section>
</template>
