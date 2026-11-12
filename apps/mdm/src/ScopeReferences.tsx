import { useState } from 'react'
import { Button, Drawer, Select, Space, Tag } from 'antd'
import type { ScopeReference } from '@rss/mdm-scopes'
import type { Locale } from './i18n'
import { EndpointPicker, type DevicesUseCases } from './EndpointPicker'
import { GroupPicker, type GroupsUseCases } from './GroupPicker'
import { Failure, labels, useAction } from './AdminUi'

export function ScopeReferences({
  title,
  value,
  onChange,
  devices,
  groups,
  locale,
  queryPrefix = 'scopePicker.',
  disabled = false,
}: {
  title: string
  value: readonly ScopeReference[]
  onChange(value: readonly ScopeReference[]): void
  devices: DevicesUseCases
  groups: GroupsUseCases
  locale: Locale
  queryPrefix?: string
  disabled?: boolean
}) {
  const l = labels(locale),
    nameRead = useAction(),
    [picker, setPicker] = useState<'device' | 'group' | null>(null),
    [context, setContext] = useState<'endpoint' | 'associated_device'>('endpoint'),
    [draft, setDraft] = useState<readonly ScopeReference[]>([]),
    [names, setNames] = useState<Readonly<Record<string, string>>>({})
  function toggle(kind: ScopeReference['kind'], id: string, name?: string) {
    if (name) setNames((current) => ({ ...current, [`${kind}/${id}`]: name }))
    setDraft((current) =>
      current.some((item) => item.kind === kind && item.id === id)
        ? current.filter((item) => item.kind !== kind || item.id !== id)
        : [...current, { kind, id }],
    )
  }
  async function readName(item: ScopeReference) {
    const result = await nameRead.run(async () => {
      if (item.kind === 'group') {
        const detail = await groups.read(item.id),
          name = detail.group.presentation['name']
        return typeof name === 'string' ? name : null
      }
      const view = await devices.view({ kind: 'endpoint', id: item.id }),
        state = view.endpoints.find((endpoint) => endpoint.id === item.id)?.displayName
      return state?.kind === 'known' && state.value.kind === 'string' ? state.value.value : null
    })
    if (result.ok)
      setNames((current) => ({
        ...current,
        [`${item.kind}/${item.id}`]: result.value ?? l('名称不可用', 'Name unavailable'),
      }))
  }
  return (
    <section className="asset-editor-section" aria-label={title}>
      <h4>{title}</h4>
      <Failure locale={locale} error={nameRead.error} kind="read" />
      <Space wrap>
        {value.map((item) => (
          <Tag
            key={`${item.kind}/${item.id}`}
            closable={!disabled}
            onClose={() =>
              onChange(value.filter((other) => other.kind !== item.kind || other.id !== item.id))
            }
          >
            {item.kind === 'device' ? l('终端', 'Endpoint') : l('设备组', 'Group')} ·{' '}
            {names[`${item.kind}/${item.id}`] ?? l('名称尚未读取', 'Name not read')}
            <details>
              <summary>{l('对象标识', 'Object identifier')}</summary>
              {item.id}
              {!names[`${item.kind}/${item.id}`] && (
                <Button disabled={nameRead.busy} onClick={() => void readName(item)}>
                  {l('读取已选名称', 'Read selected name')}
                </Button>
              )}
            </details>
          </Tag>
        ))}
      </Space>
      <Space wrap>
        {(['device', 'group'] as const).map((kind) => (
          <Button
            key={kind}
            disabled={disabled}
            onClick={() => {
              setDraft([...value])
              setPicker(kind)
            }}
          >
            {kind === 'device' ? l('添加终端', 'Add endpoints') : l('添加设备组', 'Add groups')}
          </Button>
        ))}
      </Space>
      <Drawer
        getContainer={false}
        title={`${title} · ${l('选择对象', 'Choose objects')}`}
        open={picker !== null}
        onClose={() => {
          setPicker(null)
          setDraft([])
        }}
        size="large"
        destroyOnHidden
        footer={
          <Space wrap>
            <span>
              {l('本次已选', 'Selected')} · {draft.length}
            </span>
            <Button
              onClick={() => {
                setPicker(null)
                setDraft([])
              }}
            >
              {l('取消选择', 'Cancel selection')}
            </Button>
            <Button
              type="primary"
              disabled={disabled}
              onClick={() => {
                onChange(draft)
                setPicker(null)
                setDraft([])
              }}
            >
              {l('完成选择', 'Done selecting')}
            </Button>
          </Space>
        }
      >
        {picker === 'device' && (
          <EndpointPicker
            devices={devices}
            disabled={disabled}
            locale={locale}
            selectedIds={draft.filter((item) => item.kind === 'device').map((item) => item.id)}
            queryPrefix={queryPrefix + 'device.'}
            onChange={(id, name) => toggle('device', id, name)}
          />
        )}
        {picker === 'group' && (
          <>
            <Select
              aria-label={l('组资产上下文', 'Group asset context')}
              value={context}
              disabled={disabled}
              options={[
                { value: 'endpoint', label: l('终端', 'Endpoint') },
                { value: 'associated_device', label: l('关联设备', 'Associated device') },
              ]}
              onChange={setContext}
            />
            <GroupPicker
              key={context}
              groups={groups}
              disabled={disabled}
              locale={locale}
              assetContext={context}
              value={null}
              selectedIds={draft.filter((item) => item.kind === 'group').map((item) => item.id)}
              queryPrefix={queryPrefix + context + '.'}
              onChange={(id, name) => toggle('group', id, name)}
            />
          </>
        )}
        <h4>{l('已选对象', 'Selected objects')}</h4>
        <Space wrap>
          {draft.map((item) => (
            <Tag
              key={`${item.kind}/${item.id}`}
              closable={!disabled}
              onClose={() => toggle(item.kind, item.id)}
            >
              {names[`${item.kind}/${item.id}`] ?? item.id}
            </Tag>
          ))}
        </Space>
      </Drawer>
    </section>
  )
}
