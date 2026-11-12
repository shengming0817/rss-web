import { Button, Checkbox } from 'antd'
import type { createDevices } from '@rss/mdm-devices'
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
import { deviceName, Status } from './DevicePresentation'
import { usePendingSelection } from './SelectionGuard'
import { useDirectoryQuery } from './directory-location'
export type DevicesUseCases = ReturnType<typeof createDevices>

export function EndpointPicker({
  devices,
  locale,
  onChange,
  selectedIds,
  queryPrefix = 'endpointPicker.',
  disabled = false,
}: {
  devices: DevicesUseCases
  locale: Locale
  onChange(id: string, name?: string): void
  selectedIds?: readonly string[]
  queryPrefix?: string
  disabled?: boolean
}) {
  const l = labels(locale),
    action = useAction(),
    [query, setQuery] = useDirectoryQuery(queryPrefix, { limit: 10 }),
    read = useRead(
      `endpoint-picker/${JSON.stringify(query)}`,
      (signal) =>
        devices.views(
          { ...query, fields: ['key', 'reference', 'association', 'endpoints'] },
          signal,
        ),
      { retryReadConflict: !query.cursor },
    ),
    rows =
      read.value?.items.flatMap((view) =>
        (view.endpoints ?? []).map((endpoint) => ({
          ...endpoint,
          association: view.reference?.kind === 'association' ? view.reference.id : null,
        })),
      ) ?? []
  usePendingSelection(action.busy)
  async function choose(id: string, name: string) {
    if (selectedIds?.includes(id)) {
      onChange(id, name)
      return
    }
    const result = await action.run(() => devices.endpoint(id))
    if (result.ok) onChange(result.value.id, name)
  }
  return (
    <fieldset className="asset-editor-section" disabled={disabled || action.busy}>
      <legend>{l('选择终端', 'Choose an endpoint')}</legend>
      <DirectoryControls
        catalog="devices"
        locale={locale}
        query={query}
        onChange={setQuery}
        fields={['key', 'reference', 'association', 'endpoints']}
        required="key"
        sort={[]}
        maximum={100}
        disabled={disabled || action.busy}
      />
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
            dataSource={rows}
            rowKey="id"
            columns={[
              {
                title: l('终端', 'Endpoint'),
                render: (_, row) => (
                  <>
                    <strong>{deviceName(row.displayName, row.id)}</strong>
                    <details>
                      <summary>{l('标识与关联', 'Identity and association')}</summary>
                      {row.id}
                      {row.association && ` · ${row.association}`}
                    </details>
                  </>
                ),
              },
              { title: l('通道', 'Channel'), dataIndex: 'channel' },
              {
                title: l('状态', 'State'),
                render: (_, row) => <Status locale={locale} value={row.status} />,
              },
              {
                title: l('选择', 'Choose'),
                render: (_, row) =>
                  selectedIds ? (
                    <Checkbox
                      aria-label={`${l('选择终端', 'Select endpoint')} ${deviceName(row.displayName, row.id)}`}
                      checked={selectedIds.includes(row.id)}
                      disabled={disabled || action.busy}
                      onChange={() => void choose(row.id, deviceName(row.displayName, row.id))}
                    />
                  ) : (
                    <Button
                      disabled={disabled || action.busy}
                      onClick={() => void choose(row.id, deviceName(row.displayName, row.id))}
                    >
                      {l('使用此终端', 'Use this endpoint')}
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
