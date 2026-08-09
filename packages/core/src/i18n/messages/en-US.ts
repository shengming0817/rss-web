import type { MessageSchema } from './zh-CN'

const enUS = {
  shell: {
    brand: 'RSS Web',
    env: 'foundation',
    search: { placeholder: 'Search…', shortcut: '⌘K', label: 'Open search' },
    collapse: { collapse: 'Collapse sidebar', expand: 'Expand sidebar' },
    theme: { toggle: 'Toggle theme', light: 'Light', dark: 'Dark' },
    locale: { toggle: 'Switch language', zh: 'Chinese', en: 'English' },
    breadcrumb: { root: 'RSS Web' },
    commandPalette: {
      open: 'Open command palette',
      close: 'Close command palette',
      title: 'Command palette',
      escKey: 'Esc',
    },
    sidebar: { label: 'Sidebar' },
    nav: { label: 'Main navigation' },
    skipToContent: 'Skip to content',
  },
  command: {
    searchLabel: 'Search commands',
    placeholder: 'Type a command or search…',
    empty: 'No results',
    hint: 'Type to search',
    resultsLabel: 'Search results',
  },
  home: {
    title: 'RSS Web foundation',
    subtitle: 'Product capabilities will be enabled after alignment with RSS contracts.',
  },
  errors: { unknown: 'Unknown error', network: 'Network error' },
} satisfies MessageSchema

export default enUS
