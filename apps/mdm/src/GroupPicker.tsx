import { Button, Checkbox, Space } from 'antd'
import { allOf } from '@rss/api/mdm-query'
import { formatFilter } from '@rss/api/mdm-filter'
import type { AssetContext } from '@rss/mdm-inventory'
import type { createGroups } from '@rss/mdm-groups'
import type { Locale } from './i18n'
import {
  CursorControls,
  DirectoryControls,
  Failure,
  firstPage,
  labels,
  ReadState,
  useAction,
  useRead,
} from './AdminUi'
import { DataTable } from './DataTable'
import { usePendingSelection } from './SelectionGuard'
import { useDirectoryQuery } from './directory-location'
export type GroupsUseCases = ReturnType<typeof createGroups>

export function GroupPicker({
  groups,
  locale,
  assetContext,
  referenceableFor,
  value,
  onChange,
  disabled = false,
  selectedIds,
  queryPrefix = 'groupPicker.',
}: {
  groups: GroupsUseCases
  locale: Locale
  assetContext: AssetContext
  referenceableFor?: string
  value: string | null
  onChange(id: string, name?: string): void
  disabled?: boolean
  selectedIds?: readonly string[]
  queryPrefix?: string
}) {
  const l = labels(locale),
    action = useAction(),
    [query, setQuery] = useDirectoryQuery(queryPrefix, { limit: 10 }),
    fixed = formatFilter({
      kind: 'and',
      children: [
        { kind: 'compare', field: 'assetContext', operator: '==', values: [assetContext] },
        { kind: 'compare', field: 'deleted', operator: '==', values: ['false'] },
      ],
    }),
    read = useRead(
      `group-picker/${assetContext}/${referenceableFor ?? ''}/${JSON.stringify(query)}`,
      (signal) =>
        groups.list(
          {
            ...query,
            fields: ['id', 'kind', 'assetContext', 'presentation', 'deleted', 'revision'],
            filter: allOf(fixed, query.filter),
            ...(referenceableFor ? { referenceableFor } : {}),
          },
          signal,
        ),
    )
  usePendingSelection(action.busy)
  async function choose(id: string, name: string) {
    if (selectedIds?.includes(id)) {
      onChange(id, name)
      return
    }
    const result = await action.run(async () => {
      const detail = await groups.read(id)
      if (detail.group.deleted || detail.group.assetContext !== assetContext)
        throw { cause: 'client', code: 'group_not_referenceable' }
      return detail.group.id
    })
    if (result.ok) onChange(result.value, name)
  }
  return (
    <fieldset className="asset-editor-section" disabled={disabled || action.busy}>
      <legend>{l('选择设备组', 'Choose a device group')}</legend>
      {value && (
        <p>
          {l('当前引用', 'Current reference')} · <code>{value}</code>
        </p>
      )}
      <DirectoryControls
        catalog="groups"
        locale={locale}
        query={query}
        onChange={setQuery}
        fields={['id', 'kind', 'assetContext', 'presentation', 'deleted', 'revision']}
        sort={[]}
        disabled={disabled || action.busy}
      />
      <Space>
        <Button onClick={read.reload}>{l('读取候选组', 'Read candidate groups')}</Button>
      </Space>
      <ReadState
        locale={locale}
        busy={read.busy}
        error={read.error}
        onRetry={read.reload}
        onRestart={() => setQuery(firstPage(query))}
      />
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
                render: (_, row) => (
                  <>
                    <strong>{String(row.presentation?.['name'] ?? row.id)}</strong>
                    <details>
                      <summary>{l('标识', 'Identifier')}</summary>
                      {row.id}
                    </details>
                  </>
                ),
              },
              { title: l('上下文', 'Context'), dataIndex: 'assetContext' },
              { title: l('类型', 'Type'), dataIndex: 'kind' },
              {
                title: l('选择', 'Choose'),
                render: (_, row) =>
                  selectedIds ? (
                    <Checkbox
                      aria-label={`${l('选择设备组', 'Select group')} ${String(row.presentation?.['name'] ?? row.id)}`}
                      checked={selectedIds.includes(row.id)}
                      disabled={disabled || action.busy}
                      onChange={() =>
                        void choose(row.id, String(row.presentation?.['name'] ?? row.id))
                      }
                    />
                  ) : (
                    <Button
                      disabled={disabled || action.busy}
                      onClick={() =>
                        void choose(row.id, String(row.presentation?.['name'] ?? row.id))
                      }
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
    </fieldset>
  )
}
