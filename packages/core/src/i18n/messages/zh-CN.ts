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
    resultsLabel: '搜索结果',
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
