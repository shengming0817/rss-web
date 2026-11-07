import { useState } from 'react'
import { Select, Space } from 'antd'
import type { AuditFact } from '@rss/mdm-audit'
import type { Locale } from './i18n'
import { labels } from './AdminUi'

export function useAuditFactFilter(locale: Locale) {
  const l = labels(locale)
  const [origin, setOrigin] = useState<'any' | 'request' | 'background' | 'unknown'>('any')
  const [replay, setReplay] = useState<'any' | 'replayed' | 'unmarked'>('any')
  return {
    matches: (fact: AuditFact) =>
      (origin === 'any' || (fact.origin ?? 'unknown') === origin) &&
      (replay === 'any' || fact.requestReplayed === (replay === 'replayed')),
    controls: (
      <Space wrap>
        <Select
          aria-label={l('来源（当前页）', 'Origin (current page)')}
          value={origin}
          onChange={setOrigin}
          options={[
            { value: 'any', label: l('全部来源（当前页）', 'All origins (current page)') },
            { value: 'request', label: l('HTTP 请求', 'HTTP request') },
            { value: 'background', label: l('后台处理', 'Background') },
            { value: 'unknown', label: l('来源未知', 'Unknown origin') },
          ]}
        />
        <Select
          aria-label={l('重放（当前页）', 'Replay (current page)')}
          value={replay}
          onChange={setReplay}
          options={[
            {
              value: 'any',
              label: l('全部重放标记（当前页）', 'All replay markers (current page)'),
            },
            { value: 'replayed', label: l('服务端重放', 'Server replay') },
            { value: 'unmarked', label: l('未标记重放', 'Replay unmarked') },
          ]}
        />
      </Space>
    ),
  }
}
