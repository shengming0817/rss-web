import { useEffect, useState } from 'react'
import { Alert, Button, Card, Select, Space } from 'antd'
import type { ReferenceKind, ReferenceQuery } from '@rss/mdm-groups'
import type { GroupsUseCases } from './GroupPicker'
import type { Locale } from './i18n'
import { CursorControls, firstPage, labels, ReadState, useRead } from './AdminUi'
import { DataTable } from './DataTable'
import { CollectionPlan } from './CollectionMappingEditor'

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
    [query, setQuery] = useState<ReferenceQuery>({ limit: 20 }),
    read = useRead(`group-references/${id}/${JSON.stringify(query)}`, () =>
      groups.references(id, query),
    )
  useEffect(() => {
    onDeletionChange(read.busy || read.error || !read.value ? null : read.value.deletionBlocked)
  }, [read.busy, read.error, read.value, onDeletionChange])
  return (
    <Card title={l('依赖与删除保护', 'Dependencies and deletion protection')}>
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
          onChange={(relation: NonNullable<ReferenceQuery['relation']>) => {
            const next = { ...query }
            delete next.cursor
            setQuery({ ...next, relation })
          }}
        />
        <Button onClick={read.reload}>
          {l('读取引用与删除保护', 'Read references and deletion protection')}
        </Button>
      </Space>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      {read.value && (
        <>
          <Alert
            type={read.value.deletionBlocked ? 'warning' : 'info'}
            title={
              read.value.deletionBlocked
                ? l(
                    '服务端报告仍有阻止删除的引用。授权范围内的列表可能为空。',
                    'The server reports references that block deletion. The authorized list can still be empty.',
                  )
                : l(
                    '当前服务端读取未报告删除阻止；删除事务仍会重新检查。',
                    'The current server read reports no deletion block; the delete transaction checks again.',
                  )
            }
          />
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
              { title: l('阻止删除', 'Blocks deletion'), dataIndex: 'blocksDeletion' },
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
