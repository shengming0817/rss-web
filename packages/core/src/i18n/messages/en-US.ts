import type { MessageSchema } from './zh-CN'
import type { SourceKind } from '@rss/shared'

const sourceLabels = {
  rss: 'RSS',
  mock: 'Mock',
  manual: 'Manual',
  external: 'External',
  unavailable: 'Unavailable',
} satisfies Record<SourceKind, string>

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
  },
  source: {
    label: 'Data source: {source}',
    ...sourceLabels,
  },
  contentState: {
    loading: { title: 'Loading', message: 'Fetching the latest data.' },
    empty: { title: 'No data', message: 'There is nothing to display.' },
    unavailable: { title: 'Temporarily unavailable', message: 'This content is unavailable.' },
    retry: 'Retry',
  },
  degradedState: { label: 'Unavailable state' },
  errorPage: {
    unauthorized: { title: 'Sign-in required', message: 'Sign in again to continue.' },
    forbidden: { title: 'Access denied', message: 'The server denied this operation.' },
    notFound: {
      title: 'Page not found',
      message: 'This page does not exist or is not implemented.',
    },
    conflict: { title: 'State changed', message: 'Refresh the state before trying again.' },
    rateLimited: { title: 'Too many requests', message: 'Try again later.' },
    serviceUnavailable: {
      title: 'Service unavailable',
      message: 'The service cannot complete this request.',
    },
    invalidResponse: {
      title: 'Invalid response',
      message: 'The service returned a response that cannot be used safely.',
    },
    unknown: { title: 'Operation failed', message: 'The request could not be completed.' },
    requestId: 'Request ID',
    copyRequestId: 'Copy request ID',
    copied: 'Request ID copied',
    failed: 'Request ID could not be copied',
    retryable: 'The user may safely retry',
    notRetryable: 'Do not retry automatically',
    recovery: { signIn: 'Go to sign in', retry: 'Retry', home: 'Return home' },
  },
  home: {
    title: 'RSS Web foundation',
    subtitle: 'Product capabilities will be enabled after alignment with RSS contracts.',
  },
  errors: {
    unknown: 'Unknown error',
    network: 'Network error',
    validation: 'Check the submitted values',
    invalidResponse: 'The server returned an invalid response',
    invalidRequest: 'The request could not be created',
    requestAborted: 'Request cancelled',
    requestTimeout: 'Request timed out',
  },
} satisfies MessageSchema

export default enUS
