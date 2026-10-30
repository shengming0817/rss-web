import { useState } from 'react'
import { Alert, Button, Card, Select, Space } from 'antd'
import { Link } from 'react-router-dom'
import type { Channel } from '@rss/mdm-devices'
import type { createScopes, ScopeResultKind } from '@rss/mdm-scopes'
import type { Locale } from './i18n'
import { CursorControls, firstPage, labels, ReadState, useRead, type Query } from './AdminUi'
import { DataTable } from './DataTable'
import { devicePath } from './Devices'

export type ScopesUseCases = ReturnType<typeof createScopes>
export function ScopeResults({
  scopes,
  id,
  result,
  locale,
}: {
  scopes: ScopesUseCases
  id: string
  result: string
  locale: Locale
}) {
  const l = labels(locale),
    [channel, setChannel] = useState<Channel>('agent'),
    [kind, setKind] = useState<ScopeResultKind>('members'),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = useRead(`scope-result/${id}/${result}/${channel}/${kind}/${JSON.stringify(query)}`, () =>
      scopes.result(id, result, kind, channel, query),
    )
  return (
    <Card title={l('范围结果与解释', 'Scope results and explanations')}>
      <p>
        {l('结果坐标', 'Result coordinate')} · <code>{result}</code>
      </p>
      <Space wrap>
        <Select
          aria-label={l('范围执行通道', 'Scope execution channel')}
          value={channel}
          options={[
            { value: 'agent', label: 'Agent' },
            { value: 'mdm', label: 'MDM' },
          ]}
          onChange={(value: Channel) => {
            setChannel(value)
            setQuery(firstPage(query))
          }}
        />
        <Select
          aria-label={l('范围结果页', 'Scope result page')}
          value={kind}
          options={[
            { value: 'members', label: l('成员', 'Members') },
            { value: 'decisions', label: l('资格与来源', 'Qualification and sources') },
          ]}
          onChange={(value: ScopeResultKind) => {
            setKind(value)
            setQuery(firstPage(query))
          }}
        />
        <Button onClick={read.reload}>{l('读取结果', 'Read results')}</Button>
      </Space>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      {read.value && (
        <>
          <Alert
            type={read.value.current ? 'info' : 'warning'}
            title={
              read.value.current
                ? l(
                    '当前范围结果；成员资格不证明命令已受理或设备执行。',
                    'Current scope result; membership does not establish command acceptance or device execution.',
                  )
                : l(
                    '历史结果或来源已变化，请核对当前定义与来源。',
                    'Historical result or changed inputs; review current definition and sources.',
                  )
            }
          />
          {read.value.page.kind === 'members' ? (
            <DataTable
              locale={locale}
              rowKey={(row) => `${row.kind}/${row.id}`}
              dataSource={read.value.page.items}
              columns={[
                { title: l('对象类型', 'Object kind'), dataIndex: 'kind' },
                {
                  title: l('设备', 'Device'),
                  render: (_, row) => <Link to={devicePath(row.kind, row.id)}>{row.id}</Link>,
                },
              ]}
            />
          ) : (
            <DataTable
              locale={locale}
              rowKey={(row) => `${row.object.kind}/${row.object.id}`}
              dataSource={read.value.page.items}
              columns={[
                {
                  title: l('设备', 'Device'),
                  render: (_, row) => (
                    <Link to={devicePath(row.object.kind, row.object.id)}>{row.object.id}</Link>
                  ),
                },
                {
                  title: l('资格', 'Qualification'),
                  render: (_, row) =>
                    row.qualification.state === 'eligible'
                      ? l('符合范围', 'Eligible')
                      : row.qualification.state === 'pending'
                        ? l('未知 / 待计算', 'Unknown / pending')
                        : l('已排除', 'Excluded'),
                },
                { title: l('原因', 'Reasons'), render: (_, row) => row.reasons.join(' · ') || '—' },
                {
                  title: l('来源版本', 'Source versions'),
                  render: (_, row) => (
                    <dl>
                      {(['targets', 'limitations', 'exclusions'] as const).map((key) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>
                            {row[key] === null
                              ? l('未提供来源事实', 'Source facts unavailable')
                              : row[key]
                                  .map(
                                    (item) =>
                                      `${item.reference.kind}/${item.reference.id} @${item.version}`,
                                  )
                                  .join(' · ') || '—'}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ),
                },
              ]}
            />
          )}
          <CursorControls
            locale={locale}
            query={query}
            onChange={setQuery}
            next={read.value.nextCursor}
            count={read.value.page.items.length}
          />
        </>
      )}
    </Card>
  )
}

export function ScopeTaskPanel({
  scopes,
  id,
  task,
  locale,
}: {
  scopes: ScopesUseCases
  id: string
  task: string
  locale: Locale
}) {
  const l = labels(locale),
    read = useRead(`scope-task/${id}/${task}`, () => scopes.task(id, task))
  return (
    <Card title={l('范围计算', 'Scope computation')}>
      <p>
        <code>{task}</code>
      </p>
      <Button onClick={read.reload}>{l('读取计算进度', 'Read computation progress')}</Button>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      {read.value && (
        <>
          <p>
            {read.value.status} · {l('已处理', 'Processed')} {read.value.processed} ·{' '}
            {l('成员', 'Members')} {read.value.members}
          </p>
          {read.value.failure && <Alert type="error" title={read.value.failure} />}
          {read.value.replacementTask && (
            <p>
              {l('替代计算', 'Replacement computation')} · <code>{read.value.replacementTask}</code>
            </p>
          )}
        </>
      )}
    </Card>
  )
}
