<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { onMounted, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDemo } from '../../../context'
import { operation, useOperation } from '../../../../src/services/useOperation'
import {
  configurationFormats,
  type Configuration,
  type ConfigurationChange,
  type ConfigurationFormat,
  type Setting,
} from '../clients/configurations'
import type { Platform } from '../../../../src/features/policies/clients/resources'
import PageFrame from '../../../../src/components/PageFrame.vue'
const { t } = useI18n(),
  runtime = useDemo(),
  client = runtime.policies.configurations,
  { run, runWrite, busy, failure, uncertain } = useOperation()
const editing = ref(false)
const list = ref<Awaited<ReturnType<typeof client.list>>>(),
  current = ref<Configuration>(),
  id = ref(''),
  name = ref(''),
  platform = ref<Platform>('windows'),
  format = ref<ConfigurationFormat>('windows_csp'),
  settings = ref<Setting[]>([])
const from = ref(1),
  to = ref(2),
  difference = ref<Awaited<ReturnType<typeof client.diff>>>(),
  scope = ref(''),
  version = ref(1),
  task = ref<string>(),
  preview = ref<Awaited<ReturnType<typeof client.previewStatus>>>()
let pending: (() => Promise<boolean>) | undefined
watch(platform, (value) => {
  if (!current.value) format.value = value === 'windows' ? 'windows_csp' : 'apple_profile'
})
function load(cursor?: string) {
  void run(
    () => client.list(cursor),
    (v) => (list.value = v),
  )
}
function apply(v: Configuration) {
  editing.value = false
  current.value = v
  id.value = v.id
  name.value = v.name
  platform.value = v.platform
  format.value = v.format
}
function open(value = id.value) {
  if (!busy.value && !uncertain.value)
    void run(
      () => client.read(value),
      (v) => {
        apply(v)
        settings.value = []
        difference.value = undefined
        task.value = undefined
        preview.value = undefined
      },
    )
}
function create() {
  if (busy.value || uncertain.value) return
  editing.value = true
  id.value = crypto.randomUUID()
  current.value = undefined
  name.value = ''
  settings.value = []
  difference.value = undefined
  task.value = undefined
  preview.value = undefined
}
function change(input: ConfigurationChange) {
  if (busy.value || uncertain.value) return
  const target = current.value?.id ?? id.value,
    body = operation(input, current.value?.revision ?? 0)
  pending = () =>
    runWrite(
      () => client.change(target, body),
      (v) => {
        apply(v)
        list.value = undefined
        task.value = undefined
        preview.value = undefined
      },
    )
  void pending()
}
function save() {
  change(
    current.value
      ? { action: 'version', settings: structuredClone(toRaw(settings.value)) }
      : { action: 'create', name: name.value, platform: platform.value, format: format.value },
  )
}
function copySettings(value: Setting[]) {
  editing.value = true
  settings.value = structuredClone(toRaw(value))
}
function template() {
  if (busy.value || uncertain.value || !current.value) return
  const presets: Record<ConfigurationFormat, Setting[]> = {
    windows_csp: [
      { key: './Vendor/MSFT/Firewall/MdmStore/DomainProfile/EnableFirewall', value: true },
    ],
    windows_admx: [
      {
        key: './Device/Vendor/MSFT/Policy/Config/ADMX_ControlPanelDisplay/CPL_Personalization_NoChangingLockScreen',
        value: '<enabled/>',
      },
    ],
    apple_profile: [
      { key: 'PayloadType', value: 'com.apple.security.firewall' },
      { key: 'EnableFirewall', value: true },
    ],
    apple_ddm: [
      { key: 'Type', value: 'com.apple.configuration.passcode.settings' },
      { key: 'Payload.MinimumLength', value: 8 },
    ],
  }
  settings.value = presets[current.value.format]
}
function diff() {
  if (current.value)
    void run(
      () => client.diff(current.value!.id, from.value, to.value),
      (v) => (difference.value = v),
    )
}
function startPreview() {
  if (!current.value || busy.value || uncertain.value) return
  const target = current.value.id,
    body = operation({ scope: scope.value, version: version.value }, current.value.revision)
  pending = () =>
    runWrite(
      () => client.preview(target, body),
      (v) => {
        task.value = v.task
        preview.value = undefined
      },
    )
  void pending()
}
function refresh() {
  if (current.value && task.value)
    void run(
      () => client.previewStatus(current.value!.id, task.value!),
      (v) => (preview.value = v),
    )
}
function type(index: number, event: Event) {
  const kind = (event.target as HTMLSelectElement).value
  settings.value[index]!.value = kind === 'boolean' ? false : kind === 'number' ? 0 : ''
}
onMounted(() => load())
</script>
<template>
  <PageFrame :title="t('policies.configurations')" :busy="busy" :failure="failure"
    ><p>{{ t('policies.candidate') }}</p>
    <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="create">{{
      t('policies.create')
    }}</UiButton
    ><UiButton :disabled="!!busy" type="submit" @click="load()">{{
      t('policies.reload')
    }}</UiButton>
    <p v-if="list && !list.items.length">{{ t('policies.empty') }}</p>
    <ul class="console-object-list">
      <li v-for="item in list?.items" :key="item.id">
        <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="open(item.id)">{{
          item.name
        }}</UiButton>
        ·
        {{ item.format }}
      </li>
    </ul>
    <UiButton
      v-if="list?.nextCursor"
      :disabled="!!busy"
      type="submit"
      @click="load(list.nextCursor)"
    >
      {{ t('policies.next') }}
    </UiButton>
    <div v-if="current && !editing" class="console-toolbar">
      <UiButton type="button" :disabled="busy || uncertain" @click="editing = true">{{
        t('console.edit')
      }}</UiButton>
    </div>
    <form v-show="editing" class="console-panel" @submit.prevent="save">
      <div class="console-page-header">
        <h2>{{ t(current ? 'console.edit' : 'console.create') }}</h2>
        <UiButton
          type="button"
          variant="ghost"
          :disabled="busy || uncertain"
          @click="editing = false"
          >{{ t('console.close') }}</UiButton
        >
      </div>
      <fieldset :disabled="busy || uncertain">
        <label for="configuration-id">{{ t('policies.id') }}</label
        ><input
          id="configuration-id"
          v-model="id"
          class="ui-input"
          :readonly="!!current"
          required
        /><UiButton type="button" @click="open()"> {{ t('policies.open') }}</UiButton
        ><label for="configuration-name">{{ t('policies.name') }}</label
        ><input
          id="configuration-name"
          v-model="name"
          class="ui-input"
          :readonly="!!current"
          required
        /><label for="configuration-platform">{{ t('policies.platform') }}</label
        ><select
          id="configuration-platform"
          v-model="platform"
          class="ui-input"
          :disabled="!!current"
        >
          <option value="windows">Windows</option>
          <option value="macos">macOS</option></select
        ><label for="configuration-format">{{ t('policies.format') }}</label
        ><select id="configuration-format" v-model="format" class="ui-input" :disabled="!!current">
          <option
            v-for="item in configurationFormats.filter((item) =>
              platform === 'windows' ? item.startsWith('windows_') : item.startsWith('apple_'),
            )"
            :key="item"
            :value="item"
          >
            {{ item }}
          </option></select
        ><template v-if="current"
          ><UiButton type="button" @click="template">{{ t('policies.loadTemplate') }}</UiButton>
          <p>{{ t('policies.templateHint') }}</p>
          <div v-for="(setting, index) in settings" :key="index">
            <label :for="`setting-${index}`">{{ t('policies.setting') }}</label
            ><input
              :id="`setting-${index}`"
              v-model="setting.key"
              class="ui-input"
              required
            /><label :for="`setting-type-${index}`">{{ t('policies.kind') }}</label
            ><select
              :id="`setting-type-${index}`"
              class="ui-input"
              :value="typeof setting.value"
              @change="type(index, $event)"
            >
              <option value="string">{{ t('policies.text') }}</option>
              <option value="number">{{ t('policies.number') }}</option>
              <option value="boolean">{{ t('policies.boolean') }}</option></select
            ><label :for="`setting-value-${index}`">{{ t('policies.value') }}</label
            ><input
              v-if="typeof setting.value === 'boolean'"
              :id="`setting-value-${index}`"
              v-model="setting.value"
              type="checkbox"
            /><input
              v-else-if="typeof setting.value === 'number'"
              :id="`setting-value-${index}`"
              v-model.number="setting.value"
              class="ui-input"
              type="number"
              step="any"
              required
            /><input
              v-else
              :id="`setting-value-${index}`"
              v-model="setting.value"
              class="ui-input"
            /><UiButton type="button" @click="settings.splice(index, 1)">
              {{ t('policies.remove') }}
            </UiButton>
          </div>
          <UiButton type="button" @click="settings.push({ key: '', value: '' })">
            {{ t('policies.add') }}
          </UiButton></template
        ><UiButton type="submit">{{ t('policies.save') }}</UiButton>
      </fieldset>
    </form>
    <template v-if="current"
      ><div class="ui-table-scroll">
        <table class="ui-table">
          <thead>
            <tr>
              <th>{{ t('policies.version') }}</th>
              <th>{{ t('policies.status') }}</th>
              <th>{{ t('policies.detail') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in current.versions" :key="item.version">
              <td>{{ item.version }}</td>
              <td>{{ t(`policies.state.${item.status}`) }}</td>
              <td>
                <UiButton
                  :disabled="!!(busy || uncertain)"
                  type="submit"
                  @click="copySettings(item.settings)"
                >
                  {{ t('policies.copySettings') }}</UiButton
                ><UiButton
                  :disabled="!!(busy || uncertain || item.status !== 'draft')"
                  type="submit"
                  @click="change({ action: 'publish', version: item.version })"
                >
                  {{ t('policies.publish') }}</UiButton
                ><UiButton
                  :disabled="!!(busy || uncertain || item.status === 'archived')"
                  type="submit"
                  @click="change({ action: 'archive', version: item.version })"
                >
                  {{ t('policies.archive') }}
                </UiButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <fieldset :disabled="busy">
        <legend>{{ t('policies.diff') }}</legend>
        <label for="configuration-from">{{ t('policies.before') }}</label
        ><input
          id="configuration-from"
          v-model.number="from"
          class="ui-input"
          type="number"
          min="1"
        /><label for="configuration-to">{{ t('policies.after') }}</label
        ><input
          id="configuration-to"
          v-model.number="to"
          class="ui-input"
          type="number"
          min="1"
        /><UiButton type="submit" @click="diff">
          {{ t('policies.open') }}
        </UiButton>
      </fieldset>
      <div v-if="difference" class="ui-table-scroll">
        <table class="ui-table">
          <thead>
            <tr>
              <th>{{ t('policies.setting') }}</th>
              <th>{{ t('policies.before') }}</th>
              <th>{{ t('policies.after') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in difference" :key="item.key">
              <td>{{ item.key }}</td>
              <td>{{ item.before ?? '—' }}</td>
              <td>{{ item.after ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <fieldset :disabled="busy || uncertain">
        <legend>{{ t('policies.preview') }}</legend>
        <label for="configuration-scope">{{ t('policies.scopes') }}</label
        ><input id="configuration-scope" v-model="scope" class="ui-input" /><label
          for="configuration-version"
          >{{ t('policies.version') }}</label
        ><input
          id="configuration-version"
          v-model.number="version"
          class="ui-input"
          type="number"
          min="1"
        /><UiButton type="submit" @click="startPreview">
          {{ t('policies.preview') }}
        </UiButton>
      </fieldset>
      <UiButton v-if="task" :disabled="!!busy" type="submit" @click="refresh">{{
        t('policies.refresh')
      }}</UiButton
      ><template v-if="preview"
        ><p>
          {{ t(`policies.state.${preview.status}`) }} · {{ t('policies.revision') }}
          {{ preview.scopeRevision }}
        </p>
        <div class="ui-table-scroll">
          <table class="ui-table">
            <thead>
              <tr>
                <th>{{ t('policies.device') }}</th>
                <th>{{ t('policies.support') }}</th>
                <th>{{ t('policies.reason') }}</th>
                <th>{{ t('policies.drift') }}</th>
                <th>{{ t('policies.conflicts') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in preview.rows" :key="row.device">
                <td>{{ row.device }}</td>
                <td>{{ t(`policies.state.${row.support}`) }}</td>
                <td>{{ row.reason ? t(`policies.state.${row.reason}`) : '—' }}</td>
                <td>{{ t(`policies.state.${row.drift}`) }}</td>
                <td>{{ row.conflicts.join(', ') }}</td>
              </tr>
            </tbody>
          </table>
        </div></template
      ></template
    ><UiButton v-if="uncertain && pending" :disabled="!!busy" type="submit" @click="pending()">
      {{ t('policies.replay') }}
    </UiButton></PageFrame
  >
</template>
