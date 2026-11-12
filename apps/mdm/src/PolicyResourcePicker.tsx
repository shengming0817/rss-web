import { useDirectoryQuery } from './directory-location'
import { useState } from 'react'
import { Button, Form, Select, Space } from 'antd'
import type { Resource, ResourceKind, ResourceVersion, Variant } from '@rss/mdm-resources'
import type { ResourcesUseCases } from './ResourceCommand'
import type { Locale } from './i18n'
import {
  CursorControls,
  DirectoryControls,
  Failure,
  labels,
  ReadState,
  useAction,
  useRead,
  type Query,
} from './AdminUi'
import { usePendingSelection } from './SelectionGuard'
import { DataTable } from './DataTable'

/** Select an authorized resource, then an eligible fixed version and exact variant. */
export function PolicyResourcePicker({
  resources,
  kind,
  locale,
  onSelect,
}: {
  resources: ResourcesUseCases
  kind: ResourceKind
  locale: Locale
  onSelect: (resource: Resource, version: ResourceVersion, variant: Variant) => void
}) {
  const l = labels(locale),
    action = useAction(),
    [query, setQuery] = useDirectoryQuery(`resourcePicker.${kind}.`, { limit: 10 }),
    [selected, setSelected] = useState<Resource | null>(null),
    [version, setVersion] = useState<string | null>(null),
    read = useRead(`policy-resource/${kind}/${JSON.stringify(query)}`, (signal) =>
      resources.list(
        { ...query, fields: ['id', 'kind', 'active', 'activeVersion', 'presentation', 'revision'] },
        kind, signal,
      ),
    ),
    software = kind === 'software',
    choices = selected?.versions.filter(({ state }) =>
      software ? state !== 'archived' : state === 'active',
    ),
    fixed = choices?.find((item) => item.id === version)
  usePendingSelection(action.busy)
  return (
    <fieldset className="asset-editor-section">
      <legend>
        {software
          ? l('选择软件资源', 'Choose a software resource')
          : l('选择已启用资源', 'Choose an active resource')}
      </legend>
      <DirectoryControls catalog="resources" locale={locale} query={query} onChange={setQuery} fields={['id', 'kind', 'active', 'activeVersion', 'presentation', 'revision']} sort={[]} disabled={action.busy} />
      <Button onClick={read.reload}>{l('读取资源目录', 'Read resource directory')}</Button>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      <Failure locale={locale} error={action.error} kind="read" />
      {read.value && (
        <>
          <DataTable
            locale={locale}
            rowKey="id"
            dataSource={read.value.items}
            columns={[
              {
                title: l('资源', 'Resource'),
                render: (_, row) =>
                  typeof row.presentation?.['name'] === 'string'
                    ? row.presentation['name']
                    : row.id,
              },
              { title: l('分类', 'Category'), render: (_, row) => String(row.presentation?.['category'] ?? '—') },
              { title: l('激活状态', 'Activation'), render: (_, row) => row.active ? l('已激活', 'Active') : l('未激活', 'Inactive') },
              { title: l('启用版本', 'Active version'), dataIndex: 'activeVersion' },
              {
                title: l('选择', 'Choose'),
                render: (_, row) => (
                  <Button
                    disabled={action.busy || (!software && !row.activeVersion)}
                    onClick={() =>
                      void action
                        .run(() => resources.read(row.id))
                        .then((result) => {
                          if (result.ok && result.value.kind === kind) {
                            setSelected(result.value)
                            setVersion(
                              result.value.versions.find(({ state }) => state === 'active')?.id ??
                                null,
                            )
                          }
                        })
                    }
                  >
                    {l('查看可用变体', 'View available variants')}
                  </Button>
                ),
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
      {selected && (
        <>
          <p>
            <code>{selected.id}</code>
          </p>
          <Form.Item
            label={
              software
                ? l('资源固定版本', 'Fixed resource version')
                : l('精确启用版本', 'Exact active version')
            }
          >
            <Select
              aria-label={
                software
                  ? l('资源固定版本', 'Fixed resource version')
                  : l('精确启用版本', 'Exact active version')
              }
              value={version}
              options={(choices ?? []).map((item) => ({ value: item.id, label: item.id }))}
              onChange={setVersion}
            />
          </Form.Item>
          {fixed && (
            <Space wrap>
              {fixed.variants
                .filter((variant) => variant.declaration.kind === kind)
                .map((variant) => (
                  <Button key={variant.key} onClick={() => onSelect(selected, fixed, variant)}>
                    {variant.platform} · {variant.architecture} · {variant.key}
                  </Button>
                ))}
            </Space>
          )}
        </>
      )}
    </fieldset>
  )
}
