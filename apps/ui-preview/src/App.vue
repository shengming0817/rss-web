<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme } from '@rss/core/composables'
import * as Ui from '@rss/core/components'
import type { UiNotice, UiSort, UiPaginationState } from '@rss/core/components'
const { locale } = useI18n()
const theme = useTheme()
function text(zh: string, en: string) {
  return locale.value === 'zh-CN' ? zh : en
}
const disabled = ref(false),
  invalid = ref(false),
  busy = ref(false),
  readonly = ref(false),
  empty = ref(false)
const input = ref(''),
  notes = ref(''),
  number = ref<number | null>(2),
  checked = ref<boolean | 'indeterminate'>('indeterminate'),
  switched = ref(false),
  choice = ref('alpha'),
  search = ref(''),
  date = ref<string | null>(null),
  time = ref<string | null>(null),
  instant = ref<number | null>(0)
const options = [
  { value: 'alpha', label: 'Alpha' },
  { value: 'beta', label: 'Beta' },
  { value: 'gamma', label: 'Gamma', disabled: true },
]
const tab = ref('alpha'),
  nav = ref('alpha'),
  disclosed = ref(false),
  popover = ref(false),
  dialog = ref(false),
  nested = ref(false),
  drawer = ref(false)
const selection = ref<string[]>([]),
  listSelection = ref<string[]>([]),
  sort = ref<UiSort | null>(null),
  page = ref(1),
  step = ref(0),
  notices = ref<UiNotice[]>([])
let sequence = 0
const rows = [
  { id: 'a', name: 'Alpha', value: 12 },
  { id: 'b', name: 'Beta', value: 24 },
  { id: 'c', name: 'Gamma', value: 8 },
]
const displayedRows = computed(() =>
  empty.value
    ? []
    : sort.value
      ? [...rows].sort(
          (a, b) =>
            String(a[sort.value!.key as keyof typeof a]).localeCompare(
              String(b[sort.value!.key as keyof typeof b]),
            ) * (sort.value!.direction === 'asc' ? 1 : -1),
        )
      : rows,
)
const columns = computed(() => [
  { key: 'name', label: text('名称', 'Name'), sortable: true },
  { key: 'value', label: text('数值', 'Value') },
])
const pagination = computed<UiPaginationState>(() => ({
  kind: 'pages',
  page: page.value,
  pageCount: 3,
}))
const chart = computed(() =>
  empty.value ? [] : rows.map((row) => ({ label: row.name, value: row.value })),
)
function notify() {
  notices.value.push({
    id: String(++sequence),
    title: text('交互已记录', 'Interaction recorded'),
    description: text('仅为通用控件展示。', 'Component showcase only.'),
    tone: 'info',
  })
}
const fieldError = computed(() =>
  invalid.value ? text('请输入有效内容', 'Enter a valid value') : '',
)
</script>
<template>
  <div class="preview" data-ui-preview="rss-ui-preview-only">
    <header class="preview-header">
      <div>
        <p class="preview-eyebrow">RSS / DESIGN SYSTEM</p>
        <h1>{{ text('Web 基础组件', 'Web foundations') }}</h1>
        <p>
          {{
            text(
              '功能无关的控件、状态与交互。',
              'Components, states and interactions without business logic.',
            )
          }}
        </p>
      </div>
      <Ui.UiStack direction="row" gap="2" wrap>
        <Ui.UiButton @click="locale = locale === 'zh-CN' ? 'en-US' : 'zh-CN'">{{
          locale === 'zh-CN' ? 'English' : '中文'
        }}</Ui.UiButton>
        <Ui.UiButton @click="theme.toggleTheme()">{{
          text('切换主题', 'Toggle theme')
        }}</Ui.UiButton>
      </Ui.UiStack>
    </header>
    <Ui.UiSurface :label="text('交互状态', 'Interaction states')">
      <Ui.UiStack direction="row" wrap gap="4">
        <Ui.UiCheckbox v-model="disabled" :label="text('禁用', 'Disabled')" />
        <Ui.UiCheckbox v-model="readonly" :label="text('只读', 'Read only')" />
        <Ui.UiCheckbox v-model="invalid" :label="text('校验错误', 'Invalid')" />
        <Ui.UiCheckbox v-model="busy" :label="text('加载中', 'Busy')" />
        <Ui.UiCheckbox v-model="empty" :label="text('空数据', 'Empty data')" />
      </Ui.UiStack>
    </Ui.UiSurface>
    <Ui.UiGrid min-width="23rem" gap="4">
      <Ui.UiSurface
        ><h2>{{ text('文字、布局与动作', 'Typography, layout and actions') }}</h2>
        <Ui.UiStack>
          <Ui.UiText as="h3" size="lg">{{
            text('清晰的内容层次', 'A clear content hierarchy')
          }}</Ui.UiText>
          <Ui.UiText>{{
            text('正文内容由使用方提供。', 'The consumer provides the content.')
          }}</Ui.UiText>
          <Ui.UiText muted size="sm">{{
            text(
              '辅助文字与长内容可以自然换行。',
              'Supporting text and longer content wrap naturally.',
            )
          }}</Ui.UiText>
          <Ui.UiDivider />
          <Ui.UiLink href="#app" :disabled="disabled">{{
            text('返回顶部', 'Back to top')
          }}</Ui.UiLink>
          <Ui.UiStack direction="row" wrap>
            <Ui.UiButton variant="primary" :busy="busy" :disabled="disabled" @click="notify">{{
              text('主操作', 'Primary action')
            }}</Ui.UiButton>
            <Ui.UiButton :disabled="disabled" @click="notify">{{
              text('次操作', 'Secondary action')
            }}</Ui.UiButton>
            <Ui.UiButton variant="danger" :disabled="disabled" @click="dialog = true">{{
              text('需要确认', 'Confirm action')
            }}</Ui.UiButton>
            <Ui.UiButton variant="ghost" :aria-label="text('添加', 'Add')" @click="notify"
              ><Ui.UiIcon
                ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M12 4v16M4 12h16" /></svg></Ui.UiIcon
            ></Ui.UiButton>
          </Ui.UiStack>
          <Ui.UiBreadcrumb
            :label="text('位置', 'Location')"
            :items="[{ label: 'RSS', href: '#app' }, { label: text('组件', 'Components') }]"
          />
        </Ui.UiStack>
      </Ui.UiSurface>
      <Ui.UiSurface
        ><h2>{{ text('字段与输入', 'Fields and inputs') }}</h2>
        <Ui.UiStack>
          <Ui.UiField
            id="sample-name"
            :label="text('名称', 'Name')"
            :description="text('帮助文字与字段关联。', 'Help text is associated with its field.')"
            :error="fieldError"
            required
            ><template #default="field"
              ><Ui.UiInput
                :id="field.id"
                v-model="input"
                :aria-describedby="field.describedBy"
                :invalid="field.invalid"
                :required="field.required"
                :readonly="readonly"
                :disabled="disabled" /></template
          ></Ui.UiField>
          <Ui.UiField id="sample-notes" :label="text('多行文本', 'Multiline text')"
            ><Ui.UiTextarea
              id="sample-notes"
              v-model="notes"
              :readonly="readonly"
              :disabled="disabled"
          /></Ui.UiField>
          <Ui.UiField id="sample-number" :label="text('数值', 'Number')"
            ><Ui.UiNumberInput
              id="sample-number"
              v-model="number"
              :min="0"
              :max="100"
              :step="1"
              :disabled="disabled"
              :readonly="readonly"
          /></Ui.UiField>
          <Ui.UiSearchInput
            v-model="search"
            :label="text('搜索示例', 'Example search')"
            :clear-label="text('清除搜索', 'Clear search')"
            :disabled="disabled"
            @search="notify"
          /> </Ui.UiStack
      ></Ui.UiSurface>
      <Ui.UiSurface
        ><h2>{{ text('选择', 'Selection') }}</h2>
        <Ui.UiStack>
          <Ui.UiCheckbox
            v-model="checked"
            :label="text('支持混合状态', 'Mixed state supported')"
            :disabled="disabled"
          />
          <Ui.UiSwitch
            v-model="switched"
            :label="text('启用选项', 'Enable option')"
            :disabled="disabled"
          />
          <Ui.UiRadioGroup
            v-model="choice"
            :label="text('单选', 'Radio group')"
            :options="options"
            :disabled="disabled"
          />
          <Ui.UiField id="sample-select" :label="text('选择器', 'Select')"
            ><Ui.UiSelect
              id="sample-select"
              v-model="choice"
              :options="options"
              :disabled="disabled"
              :invalid="invalid"
          /></Ui.UiField>
          <Ui.UiCombobox
            v-model="choice"
            :invalid-label="text('请选择一个选项', 'Select an option')"
            :readonly="readonly"
            :label="text('可搜索选择器', 'Searchable selector')"
            :options="options"
            :empty-label="text('没有匹配选项', 'No matching options')"
            :disabled="disabled"
            :invalid="invalid"
          />
          <Ui.UiList
            v-model="listSelection"
            :label="text('集合多选', 'Multiple selection')"
            :options="empty ? [] : options"
            multiple
            :disabled="disabled"
            :empty-label="text('没有选项', 'No options')"
          /> </Ui.UiStack
      ></Ui.UiSurface>
      <Ui.UiSurface
        ><h2>{{ text('日期与时间', 'Date and time') }}</h2>
        <Ui.UiStack>
          <Ui.UiField id="sample-date" :label="text('日历日期', 'Calendar date')"
            ><Ui.UiDateInput
              id="sample-date"
              v-model="date"
              :disabled="disabled"
              :readonly="readonly"
          /></Ui.UiField>
          <Ui.UiField id="sample-time" :label="text('时间', 'Time')"
            ><Ui.UiDateInput
              id="sample-time"
              v-model="time"
              kind="time"
              :disabled="disabled"
              :readonly="readonly"
          /></Ui.UiField>
          <Ui.UiField id="sample-utc" :label="text('UTC 时间点', 'UTC instant')"
            ><Ui.UiUtcDateTimeInput
              id="sample-utc"
              v-model="instant"
              :invalid-label="text('无效时间', 'Invalid time')"
              :error="fieldError"
              :disabled="disabled"
              :readonly="readonly"
              required
          /></Ui.UiField>
          <Ui.UiText muted size="sm">{{
            text('不会按浏览器本地时区转换。', 'No implicit browser timezone conversion.')
          }}</Ui.UiText>
        </Ui.UiStack></Ui.UiSurface
      >
      <Ui.UiSurface
        ><h2>{{ text('导航与折叠', 'Navigation and disclosure') }}</h2>
        <Ui.UiStack>
          <Ui.UiNavList
            :label="text('示例导航', 'Example navigation')"
            :items="options"
            :current="nav"
            @select="nav = $event"
          />
          <Ui.UiTabs v-model="tab" :label="text('示例页签', 'Example tabs')" :items="options"
            ><template #alpha>Alpha {{ text('内容', 'content') }}</template
            ><template #beta>Beta {{ text('内容', 'content') }}</template></Ui.UiTabs
          >
          <Ui.UiDisclosure
            v-model:open="disclosed"
            :label="text('展开更多内容', 'Show more content')"
            :disabled="disabled"
            >{{
              text(
                '折叠区只负责展示内容，不判断业务分支。',
                'Disclosure shows content without business branching.',
              )
            }}</Ui.UiDisclosure
          >
        </Ui.UiStack></Ui.UiSurface
      >
      <Ui.UiSurface
        ><h2>{{ text('菜单、浮层与对话框', 'Menus, overlays and dialogs') }}</h2>
        <Ui.UiStack>
          <Ui.UiMenu
            :label="text('更多操作', 'More actions')"
            :items="options"
            :disabled="disabled"
            @select="notify"
          />
          <Ui.UiPopover
            v-model:open="popover"
            :label="text('打开浮层', 'Open popover')"
            :close-label="text('关闭浮层', 'Close popover')"
            >{{
              text('焦点和关闭行为由交互原语管理。', 'Primitives manage focus and dismissal.')
            }}</Ui.UiPopover
          >
          <Ui.UiTooltip :label="text('键盘焦点也可显示提示', 'Focus also reveals this tooltip')"
            ><Ui.UiButton>{{ text('查看提示', 'Show tooltip') }}</Ui.UiButton></Ui.UiTooltip
          >
          <Ui.UiButton @click="dialog = true">{{ text('打开对话框', 'Open dialog') }}</Ui.UiButton
          ><Ui.UiButton @click="drawer = true">{{ text('打开侧面板', 'Open drawer') }}</Ui.UiButton>
        </Ui.UiStack></Ui.UiSurface
      >
      <Ui.UiSurface class="preview-wide"
        ><h2>{{ text('表格与分页', 'Tables and pagination') }}</h2>
        <Ui.UiTable
          v-model:selected="selection"
          v-model:sort="sort"
          :label="text('示例数据', 'Example data')"
          :rows="displayedRows"
          :columns="columns"
          :row-key="(row) => row.id"
          :row-selection-label="(row) => `${text('选择', 'Select')} ${row.name}`"
          :selection-label="text('选择当前页', 'Select current page')"
          selectable
          :busy="busy"
          :disabled="disabled"
          :busy-label="text('正在加载', 'Loading')"
          :empty-label="text('没有数据', 'No data')"
        />
        <Ui.UiPagination
          :state="pagination"
          :label="text('页码分页', 'Page navigation')"
          :previous-label="text('上一页', 'Previous')"
          :next-label="text('下一页', 'Next')"
          :busy="busy"
          @navigate="typeof $event === 'number' && (page = $event)"
        />
        <Ui.UiPagination
          :state="{ kind: 'cursor', hasPrevious: false, hasNext: true }"
          :label="text('游标分页', 'Cursor navigation')"
          :previous-label="text('前一段', 'Previous cursor')"
          :next-label="text('加载下一段', 'Load next cursor')"
          :busy="busy"
          @navigate="notify"
          ><Ui.UiText muted size="sm">{{
            text('总数未知', 'Unknown total')
          }}</Ui.UiText></Ui.UiPagination
        >
      </Ui.UiSurface>
      <Ui.UiSurface
        ><h2>{{ text('状态与反馈', 'Status and feedback') }}</h2>
        <Ui.UiStack>
          <Ui.UiStack direction="row" wrap
            ><Ui.UiBadge>{{ text('未知', 'Unknown') }}</Ui.UiBadge
            ><Ui.UiBadge tone="success">{{ text('成功', 'Success') }}</Ui.UiBadge
            ><Ui.UiBadge tone="warning">{{ text('注意', 'Warning') }}</Ui.UiBadge
            ><Ui.UiBadge tone="danger">{{ text('错误', 'Error') }}</Ui.UiBadge></Ui.UiStack
          >
          <Ui.UiMessage :title="text('信息提示', 'Information')" :announce="false">{{
            text('状态与内容由调用方提供。', 'The consumer supplies status and content.')
          }}</Ui.UiMessage>
          <Ui.UiProgress :label="text('已知进度', 'Determinate progress')" :value="60" />
          <Ui.UiProgress :label="text('未知进度', 'Indeterminate progress')" />
          <Ui.UiSpinner :label="text('处理中', 'Processing')" /><Ui.UiSkeleton />
          <Ui.UiEmptyState
            :title="text('尚无内容', 'No content yet')"
            :description="text('可放置使用方提供的操作。', 'Consumer actions can be placed here.')"
            ><Ui.UiButton @click="notify">{{
              text('重试示例', 'Example retry')
            }}</Ui.UiButton></Ui.UiEmptyState
          >
        </Ui.UiStack></Ui.UiSurface
      >
      <Ui.UiSurface
        ><h2>{{ text('步骤与基础图表', 'Steps and charts') }}</h2>
        <Ui.UiStack>
          <Ui.UiStepIndicator
            :label="text('示例步骤', 'Example steps')"
            :steps="[text('填写', 'Input'), text('核对', 'Review'), text('结束', 'Finish')]"
            :current="step"
          />
          <Ui.UiButton @click="step = (step + 1) % 3">{{
            text('切换步骤', 'Next step')
          }}</Ui.UiButton>
          <Ui.UiChart
            :label="text('数值趋势', 'Value trend')"
            kind="line"
            :points="chart"
            :empty-label="text('没有数据', 'No data')"
            :data-label="text('查看数据表', 'View data table')"
          />
          <Ui.UiChart
            :label="text('数值分布', 'Value distribution')"
            kind="bar"
            :points="chart"
            :empty-label="text('没有数据', 'No data')"
            :data-label="text('查看数据表', 'View data table')"
          />
          <Ui.UiChart
            :label="text('数值占比', 'Value shares')"
            kind="donut"
            :points="chart"
            :empty-label="text('没有数据', 'No data')"
            :data-label="text('查看数据表', 'View data table')"
          /> </Ui.UiStack
      ></Ui.UiSurface>
    </Ui.UiGrid>
    <Ui.UiDialog
      v-model:open="dialog"
      :title="text('对话框示例', 'Dialog example')"
      :description="
        text('按 Escape 关闭，焦点返回入口。', 'Escape closes the dialog and returns focus.')
      "
      :close-label="text('关闭对话框', 'Close dialog')"
    >
      <Ui.UiStack
        ><Ui.UiField id="dialog-name" :label="text('对话框输入', 'Dialog input')"
          ><Ui.UiInput id="dialog-name" v-model="input" /></Ui.UiField
        ><Ui.UiCombobox
          v-model="choice"
          :invalid-label="text('请选择一个选项', 'Select an option')"
          :readonly="readonly"
          :label="text('弹层内选择', 'Select within dialog')"
          :options="options"
          :empty-label="text('没有匹配选项', 'No matching options')"
        /><Ui.UiButton @click="nested = true">{{
          text('打开嵌套确认', 'Open nested confirmation')
        }}</Ui.UiButton></Ui.UiStack
      >
      <template #footer
        ><Ui.UiButton @click="dialog = false">{{ text('取消', 'Cancel') }}</Ui.UiButton
        ><Ui.UiButton variant="primary" @click="notify">{{
          text('示例操作', 'Example action')
        }}</Ui.UiButton></template
      >
    </Ui.UiDialog>
    <Ui.UiDialog
      v-model:open="nested"
      kind="alertdialog"
      :title="text('嵌套确认', 'Nested confirmation')"
      :description="text('仅关闭最上层，保留外层内容。', 'Only the top layer closes.')"
      :close-label="text('取消确认', 'Cancel confirmation')"
      ><Ui.UiButton @click="nested = false">{{
        text('返回外层', 'Return to parent')
      }}</Ui.UiButton></Ui.UiDialog
    >
    <Ui.UiDialog
      v-model:open="drawer"
      placement="right"
      :title="text('侧面板示例', 'Drawer example')"
      :close-label="text('关闭侧面板', 'Close drawer')"
      ><Ui.UiText>{{
        text(
          '与对话框使用同一套焦点和关闭机制。',
          'Shares the dialog focus and dismissal mechanism.',
        )
      }}</Ui.UiText></Ui.UiDialog
    >
    <Ui.UiToastRegion
      :notices="notices"
      :label="text('通知', 'Notifications')"
      :close-label="text('关闭通知', 'Dismiss notification')"
      @dismiss="notices = notices.filter((item) => item.id !== $event)"
    />
  </div>
</template>
