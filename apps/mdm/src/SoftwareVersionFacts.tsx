import { useState } from 'react'
import { Button, Card } from 'antd'
import { formatFilter } from '@rss/api/mdm-filter'
import type { PublicationRow } from '@rss/mdm-software/publications'
import {
  CursorControls,
  directoryQuery,
  labels,
  ReadState,
  usePageRead,
  type Query,
} from './AdminUi'
import { DataTable } from './DataTable'
import { LifecycleFacts, type PublicationsUseCases, type SoftwareUseCases } from './SoftwareUi'
import type { Locale } from './i18n'

const publicationFields = [
  'id',
  'resource',
  'version',
  'target',
  'outcome',
  'withdrawn',
  'withdrawal',
] as const satisfies readonly (keyof PublicationRow)[]

export function SoftwareVersionFacts({
  software,
  publications,
  resource,
  version,
  locale,
  canReadAdmission,
  canReadPublications,
}: {
  software: SoftwareUseCases
  publications: PublicationsUseCases
  resource: string
  version: string
  locale: Locale
  canReadAdmission: boolean
  canReadPublications: boolean
}) {
  const l = labels(locale),
    [query, setQuery] = useState<Query>({ limit: 100 }),
    admission = usePageRead(
      JSON.stringify(['software-admission', resource, version, canReadAdmission]),
      () => (canReadAdmission ? software.version(resource, version) : Promise.resolve(null)),
    ),
    records = usePageRead(
      JSON.stringify(['software-publication', resource, version, query, canReadPublications]),
      async () => {
        if (!canReadPublications) return null
        const filter = formatFilter({
          kind: 'and',
          children: [
            { kind: 'compare', field: 'resource', operator: '==', values: [resource] },
            { kind: 'compare', field: 'version', operator: '==', values: [version] },
          ],
        })
        const page = await publications.list(
          directoryQuery({ ...query, filter }, publicationFields),
        )
        if (page.items.some((row) => row.resource !== resource || row.version !== version))
          throw new Error('Wrong fixed software publication result')
        return page
      },
    )
  const admissionLabel = l('软件版本准入', 'Software version admission')
  const denied = l('当前权限无法读取。', 'Current permissions restrict this information.')
  return (
    <>
      <Card size="small" title={admissionLabel}>
        {canReadAdmission ? (
          <>
            <Button onClick={admission.reload}>{l('刷新准入', 'Refresh admission')}</Button>
            <ReadState
              locale={locale}
              busy={admission.busy}
              error={admission.error}
              onRetry={admission.reload}
            />
            {!admission.busy && !admission.error && admission.value && (
              <LifecycleFacts
                value={admission.value.lifecycle}
                locale={locale}
                title={l('准入记录', 'Admission record')}
              />
            )}
            {!admission.busy && !admission.error && admission.value === null && (
              <p>
                {l(
                  '无可见的精确版本准入记录。',
                  'No admission record is visible for this version.',
                )}
              </p>
            )}
          </>
        ) : (
          <p>{denied}</p>
        )}
      </Card>
      <Card size="small" title={l('软件发布状态', 'Software publication status')}>
        {canReadPublications ? (
          <>
            <Button onClick={records.reload}>
              {l('刷新发布记录', 'Refresh publication records')}
            </Button>
            <ReadState
              locale={locale}
              busy={records.busy}
              error={records.error}
              onRetry={records.reload}
            />
            {records.value && !records.busy && !records.error && (
              <>
                {records.value.items.length === 0 ? (
                  <p>{l('此版本没有发布记录。', 'This version has no publication records.')}</p>
                ) : (
                  <DataTable
                    locale={locale}
                    rowKey="id"
                    dataSource={records.value.items}
                    columns={[
                      { title: l('发布目标', 'Publication target'), dataIndex: 'target' },
                      {
                        title: l('原发布结果', 'Original publication outcome'),
                        dataIndex: 'outcome',
                      },
                      {
                        title: l('撤回结果', 'Withdrawal outcome'),
                        render: (_, row) =>
                          row.withdrawal ??
                          (row.withdrawn ? l('已请求撤回', 'Withdrawal requested') : '—'),
                      },
                    ]}
                  />
                )}
                <CursorControls
                  locale={locale}
                  query={query}
                  onChange={setQuery}
                  next={records.value.nextCursor}
                  count={records.value.items.length}
                />
              </>
            )}
          </>
        ) : (
          <p>{denied}</p>
        )}
      </Card>
    </>
  )
}
