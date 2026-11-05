import { Tag } from 'antd'
import type { Locale } from './i18n'
import { setupName } from './setup-presentation'
export function SetupStatus({ value, locale }: { value: string; locale: Locale }) {
  const color = ['ready', 'healthy', 'available', 'loaded', 'caught_up'].includes(value)
    ? 'success'
    : ['failed', 'unavailable', 'degraded'].includes(value)
      ? 'error'
      : ['pending', 'waiting', 'unconfigured', 'not_ready', 'limited'].includes(value)
        ? 'warning'
        : 'default'
  return <Tag color={color}>{setupName(locale, value)}</Tag>
}
