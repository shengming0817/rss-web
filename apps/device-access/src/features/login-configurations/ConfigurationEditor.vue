<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Configuration, ConfigurationInput, Person, Platform } from '@rss/device-access/model'
import { useDa } from '../../context'
import { useRead } from '../../services/read'
import { useMutation } from '../../services/mutation'
import { useDirectory } from '../../services/directory'
import ReadState from '../../ui/ReadState.vue'
import WriteState from '../../ui/WriteState.vue'
const props = defineProps<{ existing: Configuration | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const r = useDa(),
  id = props.existing?.id ?? crypto.randomUUID(),
  step = ref(1),
  name = ref(props.existing?.name ?? ''),
  platform = ref<Platform>(props.existing?.platform ?? 'macos'),
  role = ref<Configuration['role']>(props.existing?.role ?? 'preserve'),
  selfEnrollment = ref(props.existing?.selfEnrollment ?? true),
  scope = ref<string | null>(props.existing?.scope.id ?? null),
  excluded = ref(props.existing?.exclusions.map((x) => x.id) ?? []),
  mode = ref(props.existing?.mode ?? 'platform_sso')
const { data, busy, error, reload } = useRead((signal) => r.client.scopes(signal))
const directory = useDirectory((cursor, signal) => r.client.computers(cursor, signal))
const op = useMutation(() => '/configuration/' + (props.existing?.id ?? 'new'))
const targetScope = computed(() => data.value?.find((s) => s.id === scope.value)),
  targets = computed(() => directory.items.value.filter((c) => c.platform === platform.value))
const valid = computed(
  () => name.value.trim().length > 0 && !!targetScope.value && platform.value !== 'unknown',
)
watch(
  [platform, role, selfEnrollment, scope, excluded, mode, name],
  () => {
    if (step.value === 3) step.value = 2
  },
  { deep: true },
)
watch(platform, (v) => {
  mode.value = v === 'macos' ? 'platform_sso' : 'rss_factor'
  excluded.value = []
})
function input(operationId: string): ConfigurationInput {
  const exclusions: Person[] = targets.value
    .filter((c) => excluded.value.includes(c.id))
    .map((c) => ({ id: c.id, label: c.name }))
  return {
    id,
    operationId,
    expectedRevision: props.existing?.revision ?? 0,
    name: name.value.trim(),
    platform: platform.value,
    role: role.value,
    selfEnrollment: selfEnrollment.value,
    scope: targetScope.value!,
    exclusions,
    mode: mode.value,
  }
}
async function save() {
  if (!valid.value || !directory.complete.value) return
  const result = await op.run(
    (operationId, signal) => r.client.configuration(input(operationId), signal),
    false,
  )
  if (result) {
    step.value = 4
    emit('saved')
  }
}
async function query() {
  const result = await op.query(
    (id, signal) => r.client.operation(null, id, signal),
    (value) => value.state === 'completed',
  )
  if (result) {
    step.value = 4
    emit('saved')
  }
}
</script>
<template>
  <v-dialog
    :model-value="true"
    max-width="800"
    scrollable
    @update:model-value="
      (v) => {
        if (!v) emit('close')
      }
    "
    ><v-card
      ><div class="modal-heading">
        <h2>{{ $t('da.m676a7866fd') }}</h2>
        <v-btn variant="text" @click="emit('close')">{{ $t('da.m6c14bd7f6f') }}</v-btn>
      </div>
      <v-card-text class="modal-body"
        ><div class="wizard-track">
          <span
            v-for="(title, i) in ['登录方式', '分配范围', '核对影响', '提交结果']"
            :key="title"
            :class="{ current: step === i + 1 }"
            ><b>{{ i + 1 }}</b
            >{{ title }}</span
          >
        </div>
        <ReadState :busy="busy" :error="error" @retry="reload" /><template v-if="step === 1"
          ><v-text-field
            v-model="name"
            :label="$t('da.ma5f08c1d33')"
            maxlength="128"
            class="mb-5"
            :disabled="op.locked.value" />
          <div class="two-fields">
            <v-select
              v-model="platform"
              :items="[
                { title: 'macOS', value: 'macos' },
                { title: 'Windows', value: 'windows' },
              ]"
              :label="$t('da.me4b9d69486')"
              :disabled="op.locked.value"
            /><v-select
              v-model="role"
              :items="[
                { title: '保持已有权限', value: 'preserve' },
                { title: '普通用户', value: 'standard' },
                { title: '管理员', value: 'administrator' },
              ]"
              :label="$t('da.ma3aa180767')"
              :disabled="op.locked.value"
            />
          </div>
          <v-select
            v-model="mode"
            :items="
              platform === 'macos'
                ? [
                    { title: '平台 SSO', value: 'platform_sso' },
                    { title: 'PSSO 密码模式', value: 'password' },
                  ]
                : [
                    { title: 'RSS 附加因子', value: 'rss_factor' },
                    { title: 'Windows 原生强认证', value: 'native' },
                  ]
            "
            :label="$t('da.meb9c37cd87')"
            class="mt-5"
            :disabled="op.locked.value" /><v-switch
            v-model="selfEnrollment"
            color="primary"
            :label="$t('da.maa8bff3d51')"
            :disabled="op.locked.value"
            hide-details /></template
        ><template v-else-if="step === 2"
          ><v-select
            v-model="scope"
            :items="data ?? []"
            item-title="label"
            item-value="id"
            :label="$t('da.m2d163c3dd9')"
            :disabled="op.locked.value"
            class="mb-5"
          /><v-autocomplete
            v-model="excluded"
            :items="targets"
            item-title="name"
            item-value="id"
            :label="$t('da.mb36c0740a8')"
            multiple
            chips
            :disabled="op.locked.value"
          />
          <p class="small muted mt-5">{{ $t('da.mbd7d083988') }}</p>
          <ReadState
            :busy="directory.busy.value"
            :error="directory.error.value"
            @retry="directory.loadMore"
          />
          <v-alert v-if="!directory.complete.value" type="info" :icon="false"
            >设备目录尚未读取完整，请加载后续页再核对影响。</v-alert
          >
          <v-btn
            v-if="!directory.complete.value"
            :loading="directory.busy.value"
            :disabled="directory.blocked.value"
            @click="directory.loadMore"
            >加载下一页</v-btn
          ></template
        ><template v-else-if="step === 3"
          ><h3>{{ $t('da.m8c97403b16') }}</h3>
          <dl class="detail-list mt-4">
            <div>
              <dt>{{ $t('da.md7d7ce790b') }}</dt>
              <dd>{{ name }}</dd>
            </div>
            <div>
              <dt>{{ $t('da.m5dabeb0933') }}</dt>
              <dd>{{ platform }} / {{ mode }}</dd>
            </div>
            <div>
              <dt>{{ $t('da.m785b52eb97') }}</dt>
              <dd>{{ targetScope?.label }}</dd>
            </div>
            <div>
              <dt>{{ $t('da.m7b37cc8d1f') }}</dt>
              <dd>
                {{
                  targets
                    .filter((c) => excluded.includes(c.id))
                    .map((c) => c.name)
                    .join('、') || '无'
                }}
              </dd>
            </div>
            <div>
              <dt>{{ $t('da.m11b83f7d0f') }}</dt>
              <dd>{{ role }}</dd>
            </div>
          </dl>
          <v-alert type="info" :icon="false" class="mt-5">{{
            $t('da.mbc436ffa52')
          }}</v-alert></template
        ><template v-else
          ><h3>{{ $t('da.m17cad0d2c6') }}</h3>
          <p>{{ $t('da.m5b9535a8ac') }}</p></template
        ><WriteState :state="op.state.value" queryable @query="query" /></v-card-text
      ><v-card-actions class="modal-actions"
        ><v-btn v-if="step > 1 && step < 4" :disabled="op.locked.value" @click="step--">{{
          $t('da.m75ef1241c0')
        }}</v-btn
        ><v-spacer /><v-btn
          v-if="step < 3"
          color="primary"
          :disabled="
            !!error || busy || !name.trim() || (step === 2 && (!valid || !directory.complete.value))
          "
          @click="step++"
          >{{ step === 2 ? '核对影响' : '下一步' }}</v-btn
        ><v-btn
          v-if="step === 3"
          color="primary"
          :disabled="!valid || op.locked.value"
          @click="save"
          >{{ $t('da.m13bf67032d') }}</v-btn
        ><v-btn v-if="step === 4" @click="emit('close')">{{
          $t('da.m6c14bd7f6f')
        }}</v-btn></v-card-actions
      ></v-card
    ></v-dialog
  >
</template>
