import { useState } from 'react'
import { Button, Select, Space, Tag } from 'antd'
import type { ScopeReference } from '@rss/mdm-scopes'
import type { Locale } from './i18n'
import type { DevicesUseCases } from './EndpointPicker'
import type { GroupsUseCases } from './GroupPicker'
import { EndpointPicker } from './EndpointPicker'
import { GroupPicker } from './GroupPicker'
import { labels } from './AdminUi'

export function ScopeReferences({
  title,
  value,
  onChange,
  devices,
  groups,
  locale,
}: {
  title: string
  value: readonly ScopeReference[]
  onChange: (value: readonly ScopeReference[]) => void
  devices: DevicesUseCases
  groups: GroupsUseCases
  locale: Locale
}) {
  const l = labels(locale),
    [picker, setPicker] = useState<'device' | 'group' | null>(null),
    [context, setContext] = useState<'endpoint' | 'associated_device'>('endpoint')
  function add(kind: ScopeReference['kind'], id: string) {
    if (!value.some((item) => item.kind === kind && item.id === id))
      onChange([...value, { kind, id }])
    setPicker(null)
  }
  return (
    <fieldset className="asset-editor-section">
      <legend>{title}</legend>
      <Space wrap>
        {value.map((item, index) => (
          <Tag
            key={`${item.kind}/${item.id}`}
            closable
            onClose={() => onChange(value.filter((_, i) => i !== index))}
          >
            {item.kind === 'device' ? l('终端', 'Endpoint') : l('设备组', 'Device group')} ·{' '}
            {item.id}
          </Tag>
        ))}
      </Space>
      <Select
        aria-label={`${title} ${l('引用类型', 'reference kind')}`}
        value={picker}
        placeholder={l('添加引用', 'Add reference')}
        onChange={setPicker}
        options={[
          { value: 'device', label: l('终端', 'Endpoint') },
          { value: 'group', label: l('设备组', 'Device group') },
        ]}
      />
      {picker === 'device' && (
        <EndpointPicker devices={devices} locale={locale} onChange={(id) => add('device', id)} />
      )}
      {picker === 'group' && (
        <>
          <Select
            aria-label={l('组资产上下文', 'Group asset context')}
            value={context}
            onChange={setContext}
            options={[
              { value: 'endpoint', label: l('终端', 'Endpoint') },
              { value: 'associated_device', label: l('关联设备', 'Associated device') },
            ]}
          />
          <GroupPicker
            groups={groups}
            locale={locale}
            assetContext={context}
            value={null}
            onChange={(id) => add('group', id)}
          />
        </>
      )}
      {picker && (
        <Button onClick={() => setPicker(null)}>{l('收起候选', 'Close candidates')}</Button>
      )}
    </fieldset>
  )
}
