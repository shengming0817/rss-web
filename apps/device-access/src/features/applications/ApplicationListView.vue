<script setup lang="ts">
import { ref } from 'vue'
import type { Application } from '@rss/device-access/model'
import { useDa } from '../../context'
import { useRead } from '../../services/read'
import ReadState from '../../ui/ReadState.vue'
import Icon from '../../ui/Icon.vue'
import ApplicationEditor from './ApplicationEditor.vue'
const r = useDa(),
  cursor = ref<string | null>(null),
  editing = ref<Application | null>(null),
  open = ref(false)
const { data, busy, error, reload } = useRead(
  (signal) => r.client.applications(cursor.value, signal),
  () => cursor.value,
)
</script>
<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">ENTERPRISE APPLICATIONS</p>
      <h1>{{ $t('da.m662522f4d4') }}</h1>
      <p class="muted">{{ $t('da.m185ff7691e') }}</p>
    </div>
    <v-btn
      color="primary"
      @click="
        editing = null
        open = true
      "
      >{{ $t('da.m23008c2dff') }}</v-btn
    >
  </div>
  <ReadState :busy="busy" :error="error" @retry="reload" />
  <div v-if="data" class="application-grid">
    <section v-for="a in data.items" :key="a.id" class="panel application">
      <div class="app-card-top">
        <span class="app-mark"><Icon name="apps" /></span
        ><v-chip :color="a.enabled ? 'success' : 'secondary'">{{
          a.enabled ? '已启用' : '未启用'
        }}</v-chip>
      </div>
      <h2>{{ a.id }}</h2>
      <p class="muted">{{ a.callback }}</p>
      <p class="small muted mt-5">
        {{ a.capabilities.map((c) => (c === 'native_key' ? '平台密钥' : '密码')).join(' / ') }}
      </p>
      <v-btn
        variant="outlined"
        block
        class="mt-6"
        @click="
          editing = a
          open = true
        "
        >{{ $t('da.mfa96692279') }}</v-btn
      >
    </section>
    <p v-if="!data.items.length" class="empty">{{ $t('da.m140314fdb4') }}</p>
  </div>
  <v-btn v-if="data?.nextCursor" class="mt-5" @click="cursor = data!.nextCursor">{{
    $t('da.m67a246a344')
  }}</v-btn
  ><v-alert type="info" :icon="false" class="mt-6">{{ $t('da.m2972256e46') }}</v-alert
  ><ApplicationEditor v-if="open" :existing="editing" @close="open = false" @saved="reload" />
</template>
