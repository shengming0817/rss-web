import { useState } from 'react'
import { Button, Input, Space } from 'antd'
import type { AssetContext } from '@rss/mdm-inventory'
import type { createGroups } from '@rss/mdm-groups'
import type { Locale } from './i18n'
import {
  CursorControls,
  Failure,
  firstPage,
  labels,
  ReadState,
  useAction,
  useRead,
  type Query,
} from './AdminUi'
import { DataTable } from './DataTable'
import { usePendingSelection } from './SelectionGuard'

export type GroupsUseCases = ReturnType<typeof createGroups>
/** Every candidate page is authorized by the server. Selection re-reads the full object. */
export function GroupPicker({
  groups,
  locale,
  assetContext,
  referenceableFor,
  value,
  onChange,
  disabled = false,
}: {
  groups: GroupsUseCases
  locale: Locale
  assetContext: AssetContext
  referenceableFor?: string
  value: string | null
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const l = labels(locale),
    action = useAction(),
    [filter, setFilter] = useState(''),
    [query, setQuery] = useState<Query>({ limit: 10 }),
    read = useRead(
      `group-picker/${assetContext}/${referenceableFor ?? ''}/${JSON.stringify(query)}`,
      () =>
        groups.list({
          ...query,
          fields: ['id', 'kind', 'assetContext', 'presentation', 'deleted', 'revision'],
          filter: `assetContext=='${assetContext}';deleted==false${query.filter ? `;(${query.filter})` : ''}`,
          ...(referenceableFor ? { referenceableFor } : {}),
        }),
    )
  usePendingSelection(action.busy)
  return (
    <fieldset className="asset-editor-section" disabled={disabled || action.busy}>
      <legend>{l('选择设备组', 'Choose a device group')}</legend>
      {value && (
        <p>
          {l('当前引用', 'Current reference')} · <code>{value}</code>
        </p>
      )}
      <Space wrap>
        <Input
          aria-label={l('候选组服务端筛选', 'Candidate group server filter')}
          placeholder="name=='…'"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Button
          onClick={() => setQuery({ limit: query.limit ?? 10, ...(filter ? { filter } : {}) })}
        >
          {l('查询候选组', 'Find candidate groups')}
        </Button>
        <Button onClick={read.reload}>{l('读取候选组', 'Read candidate groups')}</Button>
      </Space>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      <Failure locale={locale} error={action.error} kind="read" />
      {read.value && (
        <>
          <DataTable
            locale={locale}
            dataSource={read.value.items}
            rowKey="id"
            columns={[
              {
                title: l('名称', 'Name'),
                render: (_, row) =>
                  typeof row.presentation?.['name'] === 'string'
                    ? row.presentation['name']
                    : row.id,
              },
              { title: l('上下文', 'Context'), dataIndex: 'assetContext' },
              {
                title: l('选择', 'Choose'),
                render: (_, row) => (
                  <Button
                    disabled={disabled || action.busy}
                    onClick={() => {
                      void action
                        .run(async () => {
                          const detail = await groups.read(row.id)
                          if (detail.group.deleted || detail.group.assetContext !== assetContext)
                            throw { cause: 'client', code: 'group_not_referenceable' }
                          return detail.group.id
                        })
                        .then((result) => {
                          if (result.ok) onChange(result.value)
                        })
                    }}
                  >
                    {l('使用此组', 'Use this group')}
                  </Button>
                ),
              },
            ]}
          />
          <CursorControls
            locale={locale}
            next={read.value.nextCursor}
            count={read.value.items.length}
            query={query}
            onChange={setQuery}
          />
        </>
      )}
      {!!read.error && query.cursor && (
        <Button onClick={() => setQuery(firstPage(query))}>
          {l('候选游标失效，返回首页', 'Candidate cursor expired; first page')}
        </Button>
      )}
    </fieldset>
  )
}
