import type { SourceKind } from '@rss/shared'

const sourceLabels = {
  rss: 'RSS',
  mock: '模拟',
  manual: '手动',
  external: '外部',
  unavailable: '不可用',
} satisfies Record<SourceKind, string>

const zhCN = {
  shell: {
    brand: 'RSS Web',
    env: 'foundation',
    search: { placeholder: '搜索…', shortcut: '⌘K', label: '打开搜索' },
    collapse: { collapse: '收起侧栏', expand: '展开侧栏' },
    theme: { toggle: '切换主题', light: '亮色', dark: '暗色' },
    locale: { toggle: '切换语言', zh: '中文', en: 'English' },
    breadcrumb: { root: 'RSS Web' },
    commandPalette: {
      open: '打开命令面板',
      close: '关闭命令面板',
      title: '命令面板',
      escKey: 'Esc',
    },
    sidebar: { label: '侧栏' },
    nav: { label: '主导航' },
    skipToContent: '跳到主要内容',
  },
  command: {
    searchLabel: '搜索命令',
    placeholder: '输入命令或搜索…',
    empty: '无结果',
    hint: '输入内容以搜索',
  },
  source: {
    label: '数据来源：{source}',
    ...sourceLabels,
  },
  contentState: {
    loading: { title: '正在加载', message: '正在获取最新数据。' },
    empty: { title: '暂无数据', message: '当前没有可显示的内容。' },
    unavailable: { title: '暂时不可用', message: '当前无法获取此内容。' },
    retry: '重试',
  },
  errorPage: {
    unauthorized: { title: '需要登录', message: '请重新登录后继续。' },
    forbidden: { title: '访问被拒绝', message: '服务端拒绝了这项操作。' },
    notFound: { title: '页面不存在', message: '请求的页面不存在或尚未实现。' },
    conflict: { title: '状态已变化', message: '请刷新状态后再次确认。' },
    rateLimited: { title: '请求过于频繁', message: '请稍后再试。' },
    serviceUnavailable: { title: '服务暂时不可用', message: '服务当前无法完成请求。' },
    invalidResponse: { title: '响应无效', message: '服务返回了无法安全使用的响应。' },
    unknown: { title: '操作失败', message: '请求未能完成。' },
    requestId: '请求 ID',
    copyRequestId: '复制请求 ID',
    copied: '请求 ID 已复制',
    failed: '无法复制请求 ID',
    retryable: '可以安全地由用户重试',
    notRetryable: '不要自动重试',
    recovery: { signIn: '前往登录', retry: '重试', home: '返回首页' },
  },
  home: {
    title: 'RSS Web 基座',
    subtitle: '业务能力将在完成 RSS 契约对齐后逐步启用。',
  },
  errors: {
    unknown: '未知错误',
    network: '网络错误',
    validation: '请检查提交的内容',
    invalidResponse: '服务返回了无效响应',
    invalidRequest: '无法创建请求',
    requestAborted: '请求已取消',
    requestTimeout: '请求超时',
  },
} as const

export default zhCN

type Widen<T> = T extends string
  ? string
  : T extends Record<string, unknown>
    ? { [K in keyof T]: Widen<T[K]> }
    : T

export type MessageSchema = Widen<typeof zhCN>
