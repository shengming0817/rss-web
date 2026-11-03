import { useState } from 'react'
import { Alert, Button, Card } from 'antd'
import type { Locale } from './i18n'
import { CursorControls, labels, ReadState, usePageRead, type Query } from './AdminUi'
import { DataTable } from './DataTable'
import type { ScopesUseCases } from './ScopeResults'

export function ScopeBlockers({
  scopes,
  id,
  locale,
}: {
  scopes: ScopesUseCases
  id: string
  locale: Locale
}) {
  const l = labels(locale),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = usePageRead(`scope-blockers/${id}/${JSON.stringify(query)}`, () =>
      scopes.references(id, query),
    )
  return (
    <Card title={l('删除引用检查', 'Deletion references')}>
      <Button onClick={read.reload}>{l('读取范围引用', 'Read scope references')}</Button>
      <ReadState
        locale={locale}
        busy={read.busy}
        error={read.error}
        empty={read.value?.items.length === 0}
      />
      <Alert
        type="info"
        title={l(
          '这里仅列出引用身份；删除时服务端会重新检查。已归档策略可能继续保留引用。',
          'This lists reference identities; deletion checks them again. Archived policies may retain references.',
        )}
      />
      {read.value && (
        <>
          <DataTable
            locale={locale}
            rowKey="id"
            dataSource={read.value.items}
            columns={[
              { title: l('策略', 'Policy'), dataIndex: 'id' },
              { title: l('版本', 'Version'), dataIndex: 'version' },
              { title: l('修订', 'Revision'), dataIndex: 'revision' },
              { title: l('用途', 'Roles'), render: (_, row) => row.roles.join(' · ') },
              {
                title: l('解除方式', 'Release'),
                render: (_, row) =>
                  row.release === 'retained_archived_policy'
                    ? l(
                        '已归档策略保留引用，不能编辑解除',
                        'Archived policy retains this reference and cannot be edited',
                      )
                    : l('编辑引用策略', 'Edit the referencing policy'),
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
  )
}
