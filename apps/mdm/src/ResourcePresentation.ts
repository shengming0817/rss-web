import type { Resource } from '@rss/mdm-resources'
import type { Locale } from './i18n'

export function resourceName(value: {
  id: string
  presentation?: Readonly<Record<string, unknown>>
}): string {
  return typeof value.presentation?.name === 'string' && value.presentation.name
    ? value.presentation.name
    : value.id
}
export function resourceKindName(kind: Resource['kind'], locale: Locale): string {
  const names = {
    software: ['软件', 'Software'],
    script: ['脚本', 'Script'],
    configuration: ['配置', 'Configuration'],
    native_collection: ['原生采集', 'Native collection'],
    agent_collection: ['Agent 采集', 'Agent collection'],
    telemetry_profile: ['遥测方案', 'Telemetry profile'],
  } as const
  return names[kind][locale === 'zh' ? 0 : 1]
}
