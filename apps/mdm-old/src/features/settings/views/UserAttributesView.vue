<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'

import { VBtn, VForm, VTable, VTextField } from 'vuetify/components'
import OperationDialog from '../../operations/components/OperationDialog.vue'
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MdmPage from '../../../ui/MdmPage.vue'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsAction, useSettingsFacts } from '../useSettingsAction'
import { type Definition, type SourceMetadata } from '../clients/profiles'
import UserAttributeEditor from '../components/UserAttributeEditor.vue'
import ProfilePanel from '../components/ProfilePanel.vue'
const directoryQuery = useDirectoryQuery(
  [
    'fieldId',
    'revision',
    'key',
    'displayName',
    'sourceKind',
    'provider',
    'valueType',
    'enabled',
    'sensitive',
    'required',
    'visibility',
    'displayUse',
    'collectedAfterMicros',
    'value',
  ],
  128,
)

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
    () => directoryQuery.read(after, (query) => runtime.settings.profiles.definitions(query), {}),
    (v) => {
      rows.value = v.items
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
function edit(id: string) {
  return run(
    () => runtime.settings.profiles.definition(id),
    (value) => {
      selected.value = value
    },
  )
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
directoryQuery.onClear(() => {
  rows.value = []
})
directoryQuery.restrict(canRead)
</script>
<template>
  <MdmPage :title="t('profiles.title')" :busy="busy" :failure="failure">
    <DirectoryControls
      :query="directoryQuery"
      :busy="busy"
      hint="fieldId / revision / key / displayName / sourceKind / provider / valueType / enabled / sensitive / required / visibility / displayUse"
      @load="load"
    />
    <DirectoryResults
      v-if="!directoryQuery.complete.value"
      :disabled="busy"
      :required="['fieldId']"
      :items="rows"
      @open="
        (row) => {
          edit(String(row.fieldId))
        }
      "
    />

    <p>{{ t('profiles.help') }}</p>
    <div class="settings-actions">
      <VBtn :disabled="busy || !canRead" @click="load()">{{ t('profiles.reload') }}</VBtn
      ><VBtn :disabled="!canWrite || busy" @click="create">{{ t('profiles.new') }}</VBtn
      ><VBtn v-if="profilePermission.canRead.value" @click="preview = !preview">{{
        t('profiles.preview')
      }}</VBtn>
    </div>
    <section v-if="recoveries.length">
      <h2>{{ t('profiles.recovery') }}</h2>
      <VBtn
        v-for="item in recoveries"
        :key="item.id"
        @click="recover(item.target.slice('user-attribute:'.length))"
        >{{ item.id }}</VBtn
      >
    </section>
    <div class="device-table-scroll">
      <VTable>
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
              <VBtn @click="edit(row.fieldId)">{{ t('profiles.edit') }}</VBtn>
            </td>
          </tr>
        </tbody>
      </VTable>
    </div>
    <p v-if="!rows.length && !busy">{{ t('profiles.unconfigured') }}</p>

    <section v-if="preview && profilePermission.canRead.value">
      <h2>{{ t('profiles.preview') }}</h2>
      <VForm class="settings-actions" @submit.prevent="sample = principal.trim()">
        <VTextField
          id="preview-principal"
          v-model="principal"
          :label="t('profiles.principal')"
        /><VBtn type="submit">{{ t('profiles.load') }}</VBtn>
      </VForm>
      <ProfilePanel :key="sample" :principal="sample" view="latest" preview />
    </section>
    <OperationDialog
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
    /></OperationDialog>
  </MdmPage>
</template>
