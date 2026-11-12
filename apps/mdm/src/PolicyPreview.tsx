import { useState } from 'react'
import { Alert, Button, Card } from 'antd'
import type { createPolicies, PolicyDefinition } from '@rss/mdm-policies'
import type { Locale } from './i18n'
import { CursorControls, labels, ReadState, usePageRead, type Query } from './AdminUi'
import { DataTable } from './DataTable'
import { useSecretVisibility } from './SecretTabs'

export type PoliciesUseCases = ReturnType<typeof createPolicies>
export function PolicyPreview({
  policies,
  id,
  expectedRevision,
  definition,
  locale,
}: {
  policies: PoliciesUseCases
  id: string
  expectedRevision: number
  definition: PolicyDefinition
  locale: Locale
}) {
  const l = labels(locale),
    active = useSecretVisibility(),
    [requested, setRequested] = useState(0),
    [basis, setBasis] = useState<string | null>(null),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = usePageRead(`qualification/${id}/${expectedRevision}/${active}/${requested}/${JSON.stringify(query)}`, signal => active && requested ? policies.preview(id, expectedRevision, definition, basis, query, signal) : Promise.resolve(null)),
    page = read.value
  return (
    <Card title={l('资格预览', 'Qualification preview')}>
      <p className="subtitle">
        {l(
          '仅在范围与已保存配置一致时预览资格；不保存配置、不创建运行。分页固定同一范围结果。',
          'Preview qualification when scopes match the saved configuration, without saving or creating runs. Pagination retains the same scope result.',
        )}
      </p>
      <Button
        disabled={read.busy}
        onClick={() => { setBasis(null); setQuery({ limit: 20 }); setRequested(n => n + 1) }}
      >
        {l('预览此草稿资格', 'Preview this draft qualification')}
      </Button>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
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
              setBasis(page.scopeResult); setQuery(query)
            }}
            next={page.nextCursor}
            count={page.items.length}
          />
        </>
      )}
    </Card>
  )
}
