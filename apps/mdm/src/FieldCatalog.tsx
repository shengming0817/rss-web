import { useState } from 'react'
import { Button, Card, Form, Input, Space } from 'antd'
import type { FieldDescriptor, FieldDetail } from '@rss/mdm-inventory'
import { fieldKey } from '@rss/mdm-inventory'
import {
  CursorControls,
  DirectoryControls,
  directoryQuery,
  Failure,
  firstPage,
  labels,
  ReadState,
  useAction,
  useRead,
  validateInput,
  type Query,
} from './AdminUi'
import { DataTable } from './DataTable'
import { FieldEditor, newField, type InventoryUseCases } from './FieldEditor'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import type { Locale } from './i18n'

const columns = [
  'key',
  'version',
  'valueType',
  'nullable',
  'manual',
  'sources',
  'platforms',
  'sensitivity',
  'unit',
  'searchable',
  'itemKey',
  'timeSeries',
  'operations',
] as const satisfies readonly (keyof FieldDescriptor)[]
const defaultColumns = ['key', 'version', 'valueType', 'platforms', 'sensitivity']
export function FieldReferences({
  inventory,
  field,
  locale,
}: {
  inventory: InventoryUseCases
  field: string
  locale: Locale
}) {
  const l = labels(locale),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = useRead(`field-references/${field}/${JSON.stringify(query)}`, () =>
      inventory.references(field, query),
    )
  return (
    <Card title={l('引用影响', 'Reference impact')}>
      <Button onClick={read.reload}>{l('读取影响', 'Read impact')}</Button>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      {read.value && (
        <>
          <p className="subtitle">
            {l(
              '直接引用摘要仅展示身份；空列表不构成删除许可。',
              'Direct references reveal identities; an empty page does not grant deletion.',
            )}
          </p>
          <DataTable
            locale={locale}
            dataSource={read.value.items}
            rowKey={(row) => JSON.stringify([row.source, row.role])}
            columns={[
              { title: l('来源类型', 'Source kind'), render: (_, row) => row.source.kind },
              {
                title: l('引用身份', 'Reference identity'),
                render: (_, row) =>
                  row.source.kind === 'saved_query'
                    ? `${row.source.instance} / ${row.source.owner} / ${row.source.id}`
                    : row.source.id,
              },
              {
                title: l('版本或修订', 'Version or revision'),
                render: (_, row) =>
                  row.source.kind === 'resource_version' ? row.source.version : row.source.revision,
              },
              { title: l('用途', 'Role'), dataIndex: 'role' },
              {
                title: l('解除方式', 'Release'),
                render: (_, row) =>
                  row.release === 'archive_referencing_version'
                    ? l('归档引用版本', 'Archive the referencing version')
                    : l('编辑或删除引用对象', 'Edit or delete the referencing object'),
              },
            ]}
          />
          <CursorControls
            locale={locale}
            query={query}
            next={read.value.nextCursor}
            count={read.value.items.length}
            onChange={setQuery}
          />
        </>
      )}
      {!read.value && query.cursor && (
        <Button onClick={() => setQuery(firstPage(query))}>{l('返回首页', 'First page')}</Button>
      )}
    </Card>
  )
}
export function FieldCatalog({
  inventory,
  locale,
  canWrite,
  canReadReferences,
}: {
  inventory: InventoryUseCases
  locale: Locale
  canWrite: boolean
  canReadReferences: boolean
}) {
  const l = labels(locale),
    action = useAction(),
    guard = useSelectionGuard(),
    [query, setQuery] = useState<Query>({ fields: defaultColumns, limit: 20 }),
    [key, setKey] = useState('custom.'),
    [detail, setDetail] = useState<FieldDetail | null>(null),
    [editor, setEditor] = useState(0),
    read = useRead(`fields/${JSON.stringify(query)}`, () =>
      inventory.fields(directoryQuery(query, columns)),
    )
  usePendingSelection(guard.locked || action.busy)
  async function open(field: string) {
    const result = await action.run(() => inventory.field(field))
    if (result.ok) {
      setDetail(result.value)
      setEditor((v) => v + 1)
    }
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card title={l('资产字段', 'Asset fields')}>
        <fieldset className="permission-panel" disabled={guard.locked || action.busy}>
          <DirectoryControls
            locale={locale}
            query={query}
            onChange={setQuery}
            fields={columns}
            sort={['key', 'version']}
            required="key"
          />
          <Space wrap>
            <Button onClick={read.reload}>{l('读取字段目录', 'Read field catalog')}</Button>
            {canWrite && (
              <Form
                layout="inline"
                onFinish={() => {
                  void action.run(async () => {
                    validateInput(() => {
                      fieldKey(key)
                      if (!key.startsWith('custom.')) throw new Error('Custom fields only')
                    })
                    setDetail(newField(key))
                    setEditor((v) => v + 1)
                  })
                }}
              >
                <Form.Item label={l('新字段键', 'New field key')}>
                  <Input
                    aria-label={l('新字段键', 'New field key')}
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                  />
                </Form.Item>
                <Button htmlType="submit">{l('新建字段', 'New field')}</Button>
              </Form>
            )}
          </Space>
          <ReadState locale={locale} busy={read.busy} error={read.error} />
          {read.value && (
            <>
              <p className="subtitle">
                {l('字典版本', 'Dictionary revision')} · {read.value.dictionary}
              </p>
              <DataTable
                locale={locale}
                dataSource={read.value.items}
                rowKey="key"
                columns={[
                  {
                    title: l('字段', 'Field'),
                    dataIndex: 'key',
                    render: (_, row) => (
                      <Button type="link" onClick={() => void open(row.key)}>
                        {row.key}
                      </Button>
                    ),
                  },
                  ...(query.fields ?? defaultColumns)
                    .filter((key) => key !== 'key')
                    .map((key) => ({
                      title: key,
                      render: (
                        _: unknown,
                        row: NonNullable<typeof read.value>['items'][number],
                      ) => {
                        const value = row[key as keyof typeof row]
                        if (value === null || value === undefined) return '—'
                        if (typeof value !== 'object') return String(value)
                        if ('kind' in value) return String(value.kind)
                        if (Array.isArray(value)) return value.join(' · ')
                        return (
                          <dl className="device-values">
                            {Object.entries(value).map(([name, item]) => (
                              <div key={name}>
                                <dt>{name}</dt>
                                <dd>
                                  {typeof item === 'object'
                                    ? l('已配置，读取详情', 'Configured; read detail')
                                    : String(item)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )
                      },
                    })),
                ]}
              />
              <CursorControls
                locale={locale}
                query={query}
                next={read.value.nextCursor}
                count={read.value.items.length}
                onChange={setQuery}
              />
            </>
          )}
          {!read.value && query.cursor && (
            <Button onClick={() => setQuery(firstPage(query))}>
              {l('返回首页', 'First page')}
            </Button>
          )}
        </fieldset>
        <Failure locale={locale} error={action.error} />
      </Card>
      {detail && (
        <div className="admin-subsection">
          <Card
            title={detail.field}
            extra={
              <Button disabled={guard.locked || action.busy} onClick={() => setDetail(null)}>
                {l('关闭详情', 'Close detail')}
              </Button>
            }
          >
            <FieldEditor
              key={editor}
              locale={locale}
              inventory={inventory}
              canWrite={canWrite}
              detail={detail}
              done={() => {
                setDetail(null)
                read.reload()
              }}
            />
          </Card>
          {canReadReferences && (
            <FieldReferences
              key={detail.field}
              locale={locale}
              inventory={inventory}
              field={detail.field}
            />
          )}
        </div>
      )}
    </SelectionGuard.Provider>
  )
}
