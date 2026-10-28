<script setup lang="ts">
import { ref } from 'vue'
import type { Application } from '@rss/device-access/model'
import { useDa } from '../../context'
import { useRead } from '../../services/read'
import { useDirectory } from '../../services/directory'
import { applicationColumns } from '@rss/device-access/client'
import { QueryRows } from '@rss/core'
import DirectoryControls from '../../ui/DirectoryControls.vue'
import ReadState from '../../ui/ReadState.vue'
import Icon from '../../ui/Icon.vue'
import ApplicationEditor from './ApplicationEditor.vue'
const r = useDa(),
  locator = ref(''),
  editing = ref<Application | null>(null),
  open = ref(false)
const directory = useDirectory(applicationColumns, 100, (query, signal) =>
  r.client.applications(query, signal),
)
const { data, busy, error, reload } = directory
const detail = useRead(
  (signal) => r.client.readApplication(locator.value, signal),
  () => locator.value,
  {
    enabled: () => !!locator.value,
    accepted(value) {
      editing.value = value
      open.value = true
    },
  },
)
function inspect(record: string) {
  if (locator.value === record) void detail.reload()
  else locator.value = record
}

function edit(value: Application | null) {
  editing.value = value
  open.value = true
}
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
      :disabled="!r.client.capabilities.applicationWrite.available"
      @click="edit(null)"
      >{{ $t('da.m23008c2dff') }}</v-btn
    >
  </div>
  <v-alert
    v-if="!r.client.capabilities.applicationWrite.available"
    type="info"
    :icon="false"
    class="mb-5"
    >当前正式服务仅开放读取。原操作恢复合同未就绪前不提交配置写入；演示入口可体验候选编辑流程。</v-alert
  >
  <DirectoryControls
    :query="directory"
    :busy="busy"
    hint="筛选及排序 id、kind；value 仅作投影。"
  /><ReadState :busy="busy" :error="error" @retry="reload" /><ReadState
    :busy="detail.busy.value"
    :error="detail.error.value"
    @retry="detail.reload"
  /><QueryRows
    v-if="data && !data.summaries"
    :items="data.items"
    :fields="directory.applied.value?.fields ?? applicationColumns"
    :required="['id']"
    @open="(row) => inspect(String(row.id))"
  />
  <div v-if="data" class="application-grid">
    <section v-for="a in data.summaries ?? []" :key="a.id" class="panel application">
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
      <v-btn variant="outlined" block class="mt-6" @click="inspect('rp:' + a.id)">{{
        $t('da.mfa96692279')
      }}</v-btn>
    </section>
    <p v-if="!data.items.length" class="empty">{{ $t('da.m140314fdb4') }}</p>
  </div>
  <v-alert type="info" :icon="false" class="mt-6">{{ $t('da.m2972256e46') }}</v-alert
  ><ApplicationEditor v-if="open" :existing="editing" @close="open = false" @saved="reload" />
</template>
