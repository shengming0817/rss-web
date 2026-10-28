<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme } from '@rss/core/composables'
import {
  VApp,
  VBtn,
  VCard,
  VCardTitle,
  VCardText,
  VCardActions,
  VCheckbox,
  VSwitch,
  VRadioGroup,
  VRadio,
  VTextField,
  VTextarea,
  VSelect,
  VAutocomplete,
  VTabs,
  VTab,
  VWindow,
  VWindowItem,
  VExpansionPanels,
  VExpansionPanel,
  VExpansionPanelTitle,
  VExpansionPanelText,
  VMenu,
  VList,
  VListItem,
  VTooltip,
  VDialog,
  VSnackbar,
  VTable,
  VPagination,
  VChip,
  VAlert,
  VProgressLinear,
  VSkeletonLoader,
  VLocaleProvider,
  VThemeProvider,
  VDefaultsProvider,
} from 'vuetify/components'
const { locale } = useI18n()
const { theme, toggleTheme } = useTheme()
const text = (zh: string, en: string) => (locale.value === 'zh-CN' ? zh : en)
const disabled = ref(false),
  readonly = ref(false),
  invalid = ref(false),
  busy = ref(false),
  empty = ref(false)
const input = ref('RSS'),
  notes = ref(''),
  number = ref<number | null>(3),
  date = ref('2026-10-27')
const checked = ref(true),
  choice = ref('first'),
  selected = ref('first'),
  query = ref(''),
  tab = ref('first')
const dialog = ref(false),
  nested = ref(false),
  toast = ref(false),
  page = ref(1)
const options = computed(() => [
  { title: text('第一项', 'First'), value: 'first' },
  { title: text('第二项', 'Second'), value: 'second' },
])
const rows = computed(() =>
  empty.value
    ? []
    : [
        { name: 'Windows', state: text('已观察', 'Observed') },
        { name: 'macOS', state: text('未知', 'Unknown') },
      ],
)
const defaults = {
  VDialog: { attach: '.preview', VMenu: { attach: '.preview' } },
  VMenu: { attach: '.preview' },
  VTooltip: { attach: '.preview' },
  VSnackbar: { attach: '.preview' },
}
</script>
<template>
  <VLocaleProvider :locale="locale === 'zh-CN' ? 'zhHans' : 'en'">
    <VThemeProvider :theme="theme"
      ><VDefaultsProvider :defaults="defaults">
        <VApp class="preview" :class="`v-theme--${theme}`" data-preview="rss-ui-preview-only">
          <header class="preview-header">
            <div>
              <p class="preview-eyebrow">RSS UI Components · Vuetify</p>
              <h1>{{ text('组件展示', 'Component gallery') }}</h1>
              <p>
                {{ text('独立展示，不加载产品接口', 'Independent preview without product APIs') }}
              </p>
            </div>
            <div class="preview-actions">
              <VBtn @click="locale = locale === 'zh-CN' ? 'en-US' : 'zh-CN'">{{
                text('English', '中文')
              }}</VBtn
              ><VBtn @click="toggleTheme">{{ text('切换主题', 'Toggle theme') }}</VBtn>
            </div>
          </header>
          <VCard
            ><VCardTitle>{{ text('交互状态', 'Interaction states') }}</VCardTitle
            ><VCardText class="preview-actions">
              <VCheckbox v-model="disabled" :label="text('禁用', 'Disabled')" /><VCheckbox
                v-model="readonly"
                :label="text('只读', 'Read only')"
              /><VCheckbox v-model="invalid" :label="text('校验错误', 'Invalid')" /><VCheckbox
                v-model="busy"
                :label="text('加载中', 'Busy')"
              /><VCheckbox v-model="empty" :label="text('空数据', 'Empty')" /> </VCardText
          ></VCard>
          <div class="preview-grid">
            <VCard
              ><VCardTitle>{{ text('按钮与反馈', 'Actions and feedback') }}</VCardTitle
              ><VCardText class="preview-stack">
                <div class="preview-actions">
                  <VBtn :disabled="disabled" :loading="busy" @click="toast = true">{{
                    text('主要操作', 'Primary action')
                  }}</VBtn
                  ><VBtn variant="outlined" :disabled="disabled" @click="toast = true">{{
                    text('次要操作', 'Secondary action')
                  }}</VBtn
                  ><VBtn color="error" :disabled="disabled" @click="toast = true">{{
                    text('危险操作', 'Destructive action')
                  }}</VBtn>
                </div>
                <div class="preview-actions">
                  <VChip color="success">{{ text('成功', 'Success') }}</VChip
                  ><VChip color="warning">{{ text('注意', 'Warning') }}</VChip
                  ><VChip>{{ text('未知', 'Unknown') }}</VChip>
                </div>
                <VAlert type="info" variant="tonal">{{
                  text('状态来自消费页面', 'The consuming page owns state')
                }}</VAlert
                ><VProgressLinear
                  :indeterminate="busy"
                  :model-value="60"
                  :aria-label="text('进度', 'Progress')"
                /><VSkeletonLoader v-if="busy" type="list-item" /> </VCardText
            ></VCard>
            <VCard
              ><VCardTitle>{{ text('表单', 'Forms') }}</VCardTitle
              ><VCardText class="preview-stack">
                <VTextField
                  v-model="input"
                  :label="text('名称', 'Name')"
                  :disabled="disabled"
                  :readonly="readonly"
                  :error-messages="invalid ? text('请输入有效名称', 'Enter a valid name') : []"
                />
                <VTextarea
                  v-model="notes"
                  :label="text('备注', 'Notes')"
                  :disabled="disabled"
                  :readonly="readonly"
                />
                <VTextField
                  v-model.number="number"
                  type="number"
                  :label="text('数量', 'Quantity')"
                  :disabled="disabled"
                  :readonly="readonly"
                />
                <VTextField
                  v-model="date"
                  type="date"
                  :label="text('日期', 'Date')"
                  :disabled="disabled"
                  :readonly="readonly"
                /> </VCardText
            ></VCard>
            <VCard
              ><VCardTitle>{{ text('选择', 'Selection') }}</VCardTitle
              ><VCardText class="preview-stack">
                <VSwitch
                  v-model="checked"
                  :label="text('启用', 'Enabled')"
                  :disabled="disabled"
                  :readonly="readonly"
                />
                <VRadioGroup
                  v-model="choice"
                  :label="text('选项', 'Options')"
                  :disabled="disabled"
                  :readonly="readonly"
                  ><VRadio
                    v-for="item in options"
                    :key="item.value"
                    :value="item.value"
                    :label="item.title"
                /></VRadioGroup>
                <VSelect
                  v-model="selected"
                  :items="empty ? [] : options"
                  :label="text('选择项目', 'Select an item')"
                  :disabled="disabled"
                  :readonly="readonly"
                />
                <VAutocomplete
                  v-model="selected"
                  v-model:search="query"
                  :items="empty ? [] : options"
                  :label="text('搜索项目', 'Search items')"
                  :disabled="disabled"
                  :readonly="readonly"
                  :loading="busy"
                /> </VCardText
            ></VCard>
            <VCard
              ><VCardTitle>{{ text('导航与弹层', 'Navigation and overlays') }}</VCardTitle
              ><VCardText class="preview-stack">
                <VTabs v-model="tab" :aria-label="text('示例页签', 'Example tabs')"
                  ><VTab
                    v-for="item in options"
                    :id="`preview-tab-${item.value}`"
                    :key="item.value"
                    :aria-controls="`preview-panel-${item.value}`"
                    :value="item.value"
                    >{{ item.title }}</VTab
                  ></VTabs
                >
                <VWindow v-model="tab"
                  ><VWindowItem
                    id="preview-panel-first"
                    role="tabpanel"
                    aria-labelledby="preview-tab-first"
                    value="first"
                    eager
                    >{{ text('第一个面板', 'First panel') }}</VWindowItem
                  ><VWindowItem
                    id="preview-panel-second"
                    role="tabpanel"
                    aria-labelledby="preview-tab-second"
                    value="second"
                    eager
                    >{{ text('第二个面板', 'Second panel') }}</VWindowItem
                  ></VWindow
                >
                <VExpansionPanels
                  ><VExpansionPanel
                    ><VExpansionPanelTitle>{{
                      text('展开详情', 'Expand details')
                    }}</VExpansionPanelTitle
                    ><VExpansionPanelText>{{
                      text('详情内容', 'Details')
                    }}</VExpansionPanelText></VExpansionPanel
                  ></VExpansionPanels
                >
                <div class="preview-actions">
                  <VMenu
                    ><template #activator="{ props }"
                      ><VBtn v-bind="props">{{ text('菜单', 'Menu') }}</VBtn></template
                    ><VList
                      ><VListItem
                        v-for="item in options"
                        :key="item.value"
                        :title="item.title"
                        @click="toast = true" /></VList
                  ></VMenu>
                  <VTooltip :text="text('键盘焦点也可显示提示', 'Also available on keyboard focus')"
                    ><template #activator="{ props }"
                      ><VBtn v-bind="props">{{ text('提示', 'Tooltip') }}</VBtn></template
                    ></VTooltip
                  >
                  <VDialog v-model="dialog" max-width="680" :aria-label="text('对话框', 'Dialog')"
                    ><template #activator="{ props }"
                      ><VBtn v-bind="props">{{ text('打开对话框', 'Open dialog') }}</VBtn></template
                    ><VCard
                      ><VCardTitle>{{ text('对话框', 'Dialog') }}</VCardTitle
                      ><VCardText class="preview-stack"
                        ><VTextField v-model="input" :label="text('名称', 'Name')" /><VSelect
                          v-model="selected"
                          :items="options"
                          :label="text('选择项目', 'Select an item')"
                        />
                        <VDialog
                          v-model="nested"
                          max-width="420"
                          :aria-label="text('嵌套对话框', 'Nested dialog')"
                          ><template #activator="{ props }"
                            ><VBtn v-bind="props">{{
                              text('打开嵌套对话框', 'Open nested dialog')
                            }}</VBtn></template
                          ><VCard
                            ><VCardTitle>{{ text('嵌套对话框', 'Nested dialog') }}</VCardTitle
                            ><VCardText
                              ><VTextField :label="text('嵌套输入', 'Nested input')" /></VCardText
                            ><VCardActions
                              ><VBtn @click="nested = false">{{
                                text('关闭内层', 'Close inner')
                              }}</VBtn></VCardActions
                            ></VCard
                          ></VDialog
                        > </VCardText
                      ><VCardActions
                        ><VBtn @click="dialog = false">{{ text('取消', 'Cancel') }}</VBtn
                        ><VBtn @click="toast = true">{{ text('保存', 'Save') }}</VBtn></VCardActions
                      ></VCard
                    ></VDialog
                  >
                </div>
              </VCardText></VCard
            >
            <VCard class="preview-wide"
              ><VCardTitle>{{ text('表格与分页', 'Tables and pagination') }}</VCardTitle
              ><VCardText
                ><VTable
                  ><thead>
                    <tr>
                      <th>{{ text('名称', 'Name') }}</th>
                      <th>{{ text('状态', 'State') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in rows" :key="row.name">
                      <td>{{ row.name }}</td>
                      <td>{{ row.state }}</td>
                    </tr>
                    <tr v-if="!rows.length">
                      <td colspan="2">{{ text('暂无数据', 'No data') }}</td>
                    </tr>
                  </tbody></VTable
                ><VPagination v-model="page" :length="3" :disabled="disabled" /></VCardText
            ></VCard>
          </div>
          <VSnackbar v-model="toast" :timeout="3000"
            >{{ text('操作反馈', 'Action feedback')
            }}<template #actions
              ><VBtn @click="toast = false">{{ text('关闭', 'Close') }}</VBtn></template
            ></VSnackbar
          >
        </VApp>
      </VDefaultsProvider></VThemeProvider
    >
  </VLocaleProvider>
</template>
