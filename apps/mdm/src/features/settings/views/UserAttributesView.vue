<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton, UiDialog } from '@rss/core/components'
import PageFrame from '../../../components/PageFrame.vue'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsAction, useSettingsFacts } from '../useSettingsAction'
import { type Definition, type SourceMetadata } from '../clients/profiles'
import UserAttributeEditor from '../components/UserAttributeEditor.vue'
import ProfilePanel from '../components/ProfilePanel.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  { canRead, canWrite } = usePermission(
    'user_attribute_definitions_read',
    'user_attribute_definitions_write',
  ),
  profilePermission = usePermission('user_profiles_read', 'user_profiles_read')
const { run, busy, failure } = useSettingsAction(() => 'user-attributes')
const rows = ref<Definition[]>([]),
  sources = ref<SourceMetadata[]>([]),
  next = ref<string | null>(null),
  selected = ref<Definition>(),
  preview = ref(false),
  principal = ref(''),
  sample = ref('')
const recoveries = computed(() =>
  [...runtime.settings.operations.records.values()].filter(
    (v) => v.target.startsWith('user-attribute:') && v.state !== 'received',
  ),
)
function clear() {
  rows.value = []
  sources.value = []
  next.value = null
  selected.value = undefined
  preview.value = false
  principal.value = ''
  sample.value = ''
}
async function load(after?: string) {
  if (!after) {
    rows.value = []
    sources.value = []
  }
  await run(
    () => runtime.settings.profiles.definitions(after),
    (v) => {
      rows.value = after ? [...rows.value, ...v.definitions] : v.definitions
      sources.value = v.sources
      next.value = v.nextCursor
    },
  )
}
function create() {
  selected.value = {
    fieldId: crypto.randomUUID(),
    revision: 0,
    collectedAfterMicros: 0,
    value: null,
  }
}
function recover(id: string) {
  selected.value = rows.value.find((v) => v.fieldId === id) ?? {
    fieldId: id,
    revision: 0,
    collectedAfterMicros: 0,
    value: null,
  }
}
useSettingsFacts(clear)
watch(failure, (v) => {
  if (v === 'denied') clear()
})
watch(canRead, (v) => {
  if (v) void load()
  else clear()
})
onMounted(() => {
  if (canRead.value) void load()
})
</script>
<template>
  <PageFrame :title="t('profiles.title')" :busy="busy" :failure="failure">
    <p>{{ t('profiles.help') }}</p>
    <div class="settings-actions">
      <UiButton :disabled="busy || !canRead" @click="load()">{{ t('profiles.reload') }}</UiButton
      ><UiButton :disabled="!canWrite || busy" @click="create">{{ t('profiles.new') }}</UiButton
      ><UiButton v-if="profilePermission.canRead.value" @click="preview = !preview">{{
        t('profiles.preview')
      }}</UiButton>
    </div>
    <section v-if="recoveries.length">
      <h2>{{ t('profiles.recovery') }}</h2>
      <UiButton
        v-for="item in recoveries"
        :key="item.id"
        @click="recover(item.target.slice('user-attribute:'.length))"
        >{{ item.id }}</UiButton
      >
    </section>
    <div class="ui-table-scroll">
      <table class="ui-table">
        <thead>
          <tr>
            <th>{{ t('profiles.name') }}</th>
            <th>{{ t('profiles.key') }}</th>
            <th>{{ t('profiles.type') }}</th>
            <th>{{ t('profiles.enabled') }}</th>
            <th>{{ t('profiles.edit') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.fieldId">
            <td>{{ row.value?.displayName }}</td>
            <td>{{ row.value?.key }}</td>
            <td>{{ row.value ? t('profiles.' + row.value.valueType) : '—' }}</td>
            <td>{{ t(row.value?.enabled ? 'profiles.true' : 'profiles.false') }}</td>
            <td>
              <UiButton @click="selected = row">{{ t('profiles.edit') }}</UiButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!rows.length && !busy">{{ t('profiles.unconfigured') }}</p>
    <UiButton v-if="next" :disabled="busy" @click="load(next ?? undefined)">{{
      t('profiles.next')
    }}</UiButton>
    <section v-if="preview && profilePermission.canRead.value">
      <h2>{{ t('profiles.preview') }}</h2>
      <form class="settings-actions" @submit.prevent="sample = principal.trim()">
        <label for="preview-principal">{{ t('profiles.principal') }}</label
        ><input id="preview-principal" v-model="principal" class="ui-input" /><UiButton
          type="submit"
          >{{ t('profiles.load') }}</UiButton
        >
      </form>
      <ProfilePanel :key="sample" :principal="sample" view="latest" preview />
    </section>
    <UiDialog
      :open="!!selected"
      :title="t('profiles.edit')"
      :close-label="t('identity.cancel')"
      placement="right"
      @update:open="!$event && (selected = undefined)"
      ><UserAttributeEditor
        v-if="selected"
        :key="selected.fieldId"
        :field="selected"
        :sources="sources"
        @changed="load()"
    /></UiDialog>
  </PageFrame>
</template>
