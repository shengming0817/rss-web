import { useEffect, useState } from 'react'
import { Alert, Button, Card, Select, Space } from 'antd'
import type { ReferenceKind, ImpactQuery } from '@rss/mdm-groups'
import type { GroupsUseCases } from './GroupPicker'
import type { Locale } from './i18n'
import { CursorControls, firstPage, labels, ReadState, useRead, type Query } from './AdminUi'
import { DataTable } from './DataTable'
import { CollectionPlan } from './CollectionMappingEditor'

function GroupImpacts({
  groups,
  locale,
  id,
}: {
  groups: GroupsUseCases
  locale: Locale
  id: string
}) {
  const l = labels(locale),
    [query, setQuery] = useState<ImpactQuery>({ limit: 20 }),
    read = useRead(`group-references/${id}/${JSON.stringify(query)}`, () =>
      groups.impacts(id, query),
    )
  return (
    <Card title={l('递归影响', 'Recursive impacts')}>
      <p className="subtitle">
        {l(
          '按来源读取权限展示递归影响；筛选结果不用于判断能否删除。',
          'Recursive impacts follow source read permissions. Filtered results do not determine deletion eligibility.',
        )}
      </p>
      <Space wrap>
        <Select
          aria-label={l('引用类型', 'Reference kind')}
          className="admin-select"
          allowClear
          value={query.kind}
          options={[
            { value: 'group', label: l('设备组', 'Device group') },
            { value: 'scope', label: 'Scope' },
            { value: 'policy', label: l('策略', 'Policy') },
            { value: 'compliance_rule', label: l('合规规则', 'Compliance rule') },
          ]}
          onChange={(kind: ReferenceKind | undefined) => {
            const next = { ...query }
            delete next.cursor
            delete next.kind
            setQuery({ ...next, ...(kind ? { kind } : {}) })
          }}
        />
        <Select
          aria-label={l('引用关系', 'Reference relation')}
          value={query.relation ?? 'all'}
          options={[
            { value: 'all', label: l('全部关系', 'All relations') },
            { value: 'direct', label: l('直接引用', 'Direct') },
            { value: 'indirect', label: l('间接引用', 'Indirect') },
          ]}
          onChange={(relation: NonNullable<ImpactQuery['relation']>) => {
            const next = { ...query }
            delete next.cursor
            setQuery({ ...next, relation })
          }}
        />
        <Button onClick={read.reload}>{l('读取影响', 'Read impacts')}</Button>
      </Space>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      {read.value && (
        <>
          <DataTable
            locale={locale}
            dataSource={read.value.items}
            rowKey={(row) => JSON.stringify([row.source, row.relation])}
            columns={[
              {
                title: l('引用来源', 'Referencing source'),
                render: (_, row) => `${row.source.kind} / ${row.source.id}`,
              },
              { title: l('版本', 'Revision'), dataIndex: 'revision' },
              { title: l('关系', 'Relation'), dataIndex: 'relation' },
              {
                title: l('状态', 'State'),
                render: (_, row) => `${row.lifecycleState} · ${row.freshness}`,
              },
              {
                title: l('用途与代表路径', 'Roles and representative path'),
                render: (_, row) => (
                  <details>
                    <summary>{row.roles.join(' · ')}</summary>
                    <CollectionPlan value={{ effective: row.effective, via: row.via }} />
                  </details>
                ),
              },
            ]}
          />
          <CursorControls
            locale={locale}
            next={read.value.nextCursor}
            query={query}
            onChange={setQuery}
            count={read.value.items.length}
          />
        </>
      )}
      {!!read.error && query.cursor && (
        <Button onClick={() => setQuery(firstPage(query))}>
          {l('引用游标失效，返回首页', 'Reference cursor expired; first page')}
        </Button>
      )}
    </Card>
  )
}

export function GroupReferences({
  groups,
  locale,
  id,
  onDeletionChange,
}: {
  groups: GroupsUseCases
  locale: Locale
  id: string
  onDeletionChange: (blocked: boolean | null) => void
}) {
  const l = labels(locale),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = useRead(`group-blockers/${id}/${JSON.stringify(query)}`, () =>
      groups.references(id, query),
    )
  useEffect(() => {
    onDeletionChange(
      read.busy || read.error || !read.value
        ? null
        : !!query.cursor || read.value.items.length > 0 || read.value.nextCursor !== null,
    )
  }, [read.busy, read.error, read.value, query.cursor, onDeletionChange])
  return (
    <>
      <Card title={l('直接引用与删除保护', 'Direct references and deletion protection')}>
        <Button onClick={read.reload}>{l('读取直接引用', 'Read direct references')}</Button>
        <ReadState
          locale={locale}
          busy={read.busy}
          error={read.error}
          empty={read.value?.items.length === 0}
        />
        <Alert
          type="info"
          title={l(
            '这里只展示引用身份；空列表不构成删除许可，服务端会在删除时重新检查。',
            'This lists reference identities. An empty page does not grant deletion; the server checks again.',
          )}
        />
        {read.value && (
          <>
            <DataTable
              locale={locale}
              rowKey={(row) => `${row.kind}/${row.id}`}
              dataSource={read.value.items}
              columns={[
                { title: l('来源类型', 'Source kind'), dataIndex: 'kind' },
                { title: l('引用身份', 'Reference identity'), dataIndex: 'id' },
                { title: l('修订', 'Revision'), dataIndex: 'revision' },
                { title: l('用途', 'Roles'), render: (_, row) => row.roles.join(' · ') },
                {
                  title: l('解除方式', 'Release'),
                  render: () => l('编辑或删除引用对象', 'Edit or delete the referencing object'),
                },
              ]}
            />
            <CursorControls
              locale={locale}
              query={query}
              onChange={setQuery}
              next={read.value.nextCursor}
              count={read.value.items.length}
            />
          </>
        )}
      </Card>
      <GroupImpacts groups={groups} locale={locale} id={id} />
    </>
  )
}
