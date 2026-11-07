import { EntryCopies, type CopyEntry } from './EntryCopies'
import type { Runtime } from './runtime'
import { Button, Card, Descriptions } from 'antd'
import { Link, useLocation } from 'react-router-dom'
import type { Policy, PolicyRow } from '@rss/mdm-policies'
import type { Locale } from './i18n'
import type { PoliciesUseCases } from './PolicyPreview'
import { CursorControls, ReadState, firstPage, labels, usePageRead, type Query } from './AdminUi'
import { DataTable } from './DataTable'
import { useState } from 'react'

const nameFields = [
  'id',
  'toolName',
  'alias',
  'customEvent',
  'state',
  'versionId',
  'revision',
] as const satisfies readonly (keyof PolicyRow)[]

export function PolicyNames({
  policies,
  policy,
  locale,
  runtime,
}: {
  policies: PoliciesUseCases
  policy: Policy
  locale: Locale
  runtime: Runtime
}) {
  const l = labels(locale),
    identity = usePageRead(
      `policy-names/${policy.id}/${policy.revision}`,
      async (signal) => {
        const page = await policies.list(
          {
            limit: 2,
            fields: nameFields,
            filter: `id=='${policy.id}';state=in=(enabled,disabled,archived)`,
          },
          signal,
        )
        const row = page.items[0]
        if (
          !row ||
          row.id !== policy.id ||
          page.items.length !== 1 ||
          page.nextCursor ||
          !row.toolName ||
          row.revision === undefined ||
          !row.versionId ||
          row.state === undefined ||
          row.alias === undefined ||
          row.customEvent === undefined
        )
          throw new Error('Policy address unavailable')
        return row
      },
      { retryReadConflict: true },
    ),
    row = identity.value,
    display = policy.definition.selfService?.presentation['displayName'],
    event = row?.customEvent ?? null
  const entries: CopyEntry[] = []
  const eligible =
    row?.state === 'enabled' &&
    row.revision === policy.revision &&
    policy.definition.selfService?.published === true &&
    ['execution', 'software'].includes(policy.definition.action.kind)
  if (eligible && row?.toolName && row.versionId && row.revision) {
    const exact = { version: row.versionId, revision: row.revision }
    entries.push(
      {
        label: l('策略 ID', 'Policy ID'),
        target: {
          ...exact,
          selector: { kind: 'capability', selector: { kind: 'id', id: row.id } },
        },
      },
      {
        label: l('工具名', 'Tool name'),
        target: {
          ...exact,
          selector: { kind: 'capability', selector: { kind: 'tool_name', name: row.toolName } },
        },
      },
    )
    if (row.alias)
      entries.push({
        label: l('唯一别名', 'Unique alias'),
        target: {
          ...exact,
          selector: { kind: 'capability', selector: { kind: 'alias', alias: row.alias } },
        },
      })
  }
  if (event)
    entries.push({
      label: l('共享事件', 'Shared event'),
      target: { selector: { kind: 'event', name: event } },
    })

  return (
    <Card
      title={l('名称与入口', 'Names and entry points')}
      extra={
        <Button disabled={identity.busy} onClick={identity.reload}>
          {l('重新读取名称与入口', 'Read names and entry points again')}
        </Button>
      }
    >
      <ReadState
        locale={locale}
        busy={identity.busy}
        error={identity.error}
        onRetry={identity.reload}
      />
      {row && (
        <>
          <Descriptions column={1} size="small">
            <Descriptions.Item label={l('显示名称（可重复）', 'Display name (may repeat)')}>
              {typeof display === 'string' && row.revision === policy.revision ? display : '—'}
            </Descriptions.Item>
            <Descriptions.Item label={l('稳定工具名（只读）', 'Stable tool name (read-only)')}>
              <code>{row.toolName}</code>
            </Descriptions.Item>
            <Descriptions.Item label={l('唯一别名', 'Unique alias')}>
              {row.alias ?? l('未设置', 'Not set')}
            </Descriptions.Item>
            <Descriptions.Item label={l('共享事件名', 'Shared event name')}>
              {event ?? l('未关联', 'Not associated')}
            </Descriptions.Item>
            <Descriptions.Item label={l('精确策略版本', 'Exact policy version')}>
              {row.versionId} · r{row.revision}
            </Descriptions.Item>
          </Descriptions>
          <p>
            {l(
              '工具名定位单条策略；别名在租户内唯一，事件可关联多条策略。到“定义与发布”清空字段并保存，即撤回该策略的别名或事件关联。',
              'A tool name locates one policy. An alias is unique within the tenant; an event may match several policies. Clear and save a field in Definition and publication to withdraw this policy’s alias or event association.',
            )}
          </p>
          {!eligible && (
            <p>
              {l(
                '仅同修订、已启用并发布的脚本或软件自助策略可复制 Agent 策略入口。',
                'Agent policy links require the current revision of an enabled and published script or software policy.',
              )}
            </p>
          )}
          <EntryCopies runtime={runtime} locale={locale} entries={entries} />
          {event && (
            <EventAssociations key={event} event={event} policies={policies} locale={locale} />
          )}
        </>
      )}
    </Card>
  )
}

function EventAssociations({
  event,
  policies,
  locale,
}: {
  event: string
  policies: PoliciesUseCases
  locale: Locale
}) {
  const l = labels(locale),
    location = useLocation(),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = usePageRead(
      `event-associations/${event}/${query.cursor ?? ''}`,
      async (signal) => {
        if (!/^[a-z0-9._-]{1,64}$/.test(event)) throw new Error('Invalid event identity')
        const page = await policies.list(
          { ...query, fields: nameFields, filter: `customEvent=='${event}';state!='archived'` },
          signal,
        )
        if (page.items.some((row) => row.customEvent !== event || row.state === 'archived'))
          throw new Error('Wrong event association')
        return page
      },
      { retryReadConflict: !query.cursor },
    )
  return (
    <section aria-label={l('当前事件关联成员', 'Current event associations')}>
      <h3>{l('当前事件关联成员', 'Current event associations')}</h3>
      <p>
        {l(
          '当前关联供配置核对；历史批次保留原成员及版本。',
          'These are the current associations. Historical batches keep their original members and versions.',
        )}
      </p>
      <Button onClick={read.reload}>{l('刷新成员', 'Refresh members')}</Button>
      <ReadState
        locale={locale}
        busy={read.busy}
        error={read.error}
        empty={read.value?.items.length === 0}
        onRetry={read.reload}
        onRestart={() => (query.cursor ? setQuery(firstPage(query)) : read.reload())}
      />
      {read.value && (
        <>
          <DataTable
            locale={locale}
            rowKey="id"
            dataSource={read.value.items}
            columns={[
              {
                title: l('所属策略', 'Owning policy'),
                render: (_, row) => (
                  <Link
                    to={`/policies?${new URLSearchParams({ policy: row.id, tab: 'definition', returnTo: location.pathname + location.search })}`}
                  >
                    {row.toolName ?? row.id}
                  </Link>
                ),
              },
              { title: l('别名', 'Alias'), dataIndex: 'alias' },
              { title: l('状态', 'State'), dataIndex: 'state' },
              { title: l('执行版本', 'Execution version'), dataIndex: 'versionId' },
            ]}
          />
          <CursorControls
            locale={locale}
            query={query}
            onChange={setQuery}
            count={read.value.items.length}
            next={read.value.nextCursor}
          />
        </>
      )}
    </section>
  )
}
