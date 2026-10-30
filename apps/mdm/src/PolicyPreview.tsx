import { useState } from 'react'
import { Alert, Button, Card } from 'antd'
import { freeze } from '@rss/mdm-inventory'
import type { createPolicies, PolicyDefinition, PolicyPreview as Preview } from '@rss/mdm-policies'
import type { Locale } from './i18n'
import { CursorControls, Failure, labels, useAction, type Query } from './AdminUi'
import { DataTable } from './DataTable'
import { usePendingSelection } from './SelectionGuard'

export type PoliciesUseCases = ReturnType<typeof createPolicies>
export function PolicyPreview({
  policies,
  definition,
  locale,
}: {
  policies: PoliciesUseCases
  definition: PolicyDefinition
  locale: Locale
}) {
  const l = labels(locale),
    action = useAction(),
    [fixed, setFixed] = useState<PolicyDefinition | null>(null),
    [page, setPage] = useState<Preview | null>(null),
    [query, setQuery] = useState<Query>({ limit: 20 })
  usePendingSelection(action.busy)
  async function load(input: PolicyDefinition, basis: string | null, query: Query) {
    const result = await action.run(() => policies.preview(input, basis, query))
    if (result.ok) {
      setFixed(input)
      setPage(result.value)
      setQuery(query)
    }
  }
  return (
    <Card title={l('资格预览', 'Qualification preview')}>
      <p className="subtitle">
        {l(
          '预览当前草稿，不保存策略、不创建运行；分页固定同一范围结果。',
          'Preview the current draft without saving or creating runs. Pagination retains the same scope result.',
        )}
      </p>
      <Button
        disabled={action.busy}
        onClick={() => void load(freeze(definition), null, { limit: 20 })}
      >
        {l('预览此草稿资格', 'Preview this draft qualification')}
      </Button>
      <Failure locale={locale} error={action.error} kind="read" />
      {page && (
        <>
          <Alert
            type="info"
            title={l(
              '以下为上次预览时的冻结草稿；继续编辑不会修改此结果。',
              'These results use the draft frozen at the last preview. Further edits do not change them.',
            )}
          />
          <p>
            <code>{page.scopeResult}</code>
          </p>
          <DataTable
            locale={locale}
            rowKey={(row) => `${row.object.kind}/${row.object.id}`}
            dataSource={page.items}
            columns={[
              { title: l('设备', 'Device'), render: (_, row) => row.object.id },
              { title: l('通道', 'Channel'), dataIndex: 'channel' },
              {
                title: l('范围资格', 'Scope qualification'),
                render: (_, row) => row.eligibility.state,
              },
              { title: l('通道可用性', 'Channel availability'), dataIndex: 'availability' },
              { title: l('原因', 'Reason'), dataIndex: 'reason' },
              {
                title: l('本轮准入', 'Current admission'),
                render: (_, row) =>
                  row.taskAdmission?.state ??
                  ('collectionSupported' in row && row.collectionSupported === false
                    ? l('采集不支持', 'Collection unsupported')
                    : '—'),
              },
            ]}
          />
          <CursorControls
            locale={locale}
            query={query}
            onChange={(query) => {
              if (fixed) void load(fixed, page.scopeResult, query)
            }}
            next={page.nextCursor}
            count={page.items.length}
          />
        </>
      )}
    </Card>
  )
}
