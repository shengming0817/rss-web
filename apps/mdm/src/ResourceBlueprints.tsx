import { useState } from 'react'
import { Alert, Button, Card, Form, Input, Select, Tag } from 'antd'
import { labels, ReadState, useRead } from './AdminUi'
import { CollectionPlan } from './CollectionMappingEditor'
import { ResourceCommandState, useResourceCommand, type ResourcesUseCases } from './ResourceCommand'
import type { Locale } from './i18n'

export function ResourceBlueprints({
  resources,
  locale,
  canWrite,
}: {
  resources: ResourcesUseCases
  locale: Locale
  canWrite: boolean
}) {
  const l = labels(locale),
    catalog = useRead('resource-blueprints', resources.blueprints),
    command = useResourceCommand(resources),
    [selection, setSelection] = useState(''),
    [resource, setResource] = useState(''),
    key = (id: string, version: string) => JSON.stringify([id, version]),
    selected = catalog.value?.items.find((item) => key(item.id, item.version) === selection)
  return (
    <Card title={l('官方采集与配置 Blueprint', 'Official collection and configuration blueprints')}>
      <Button
        disabled={command.action.busy || command.outcome === 'unknown'}
        onClick={catalog.reload}
      >
        {l('读取 Blueprint 目录', 'Read blueprint catalog')}
      </Button>
      <ReadState
        busy={catalog.busy}
        error={catalog.error}
        empty={catalog.value?.items.length === 0}
        locale={locale}
      />
      {catalog.value && (
        <>
          <p className="subtitle">
            {catalog.value.categories.map((category) => (
              <Tag key={category}>{category}</Tag>
            ))}
          </p>
          <Form
            layout="vertical"
            disabled={command.pending !== null || command.action.busy}
            onFinish={() => {
              if (selected)
                void command.submit(resource, 0, {
                  action: 'instantiate',
                  blueprint: selected.id,
                  version: selected.version,
                })
            }}
          >
            <Form.Item label={l('Blueprint 精确版本', 'Exact blueprint version')}>
              <Select
                aria-label={l('Blueprint 精确版本', 'Exact blueprint version')}
                showSearch
                optionFilterProp="label"
                value={selection || null}
                options={catalog.value.items.map((item) => ({
                  value: key(item.id, item.version),
                  label: `${typeof item.presentation.name === 'string' ? item.presentation.name : item.id} · ${item.version} · ${item.platform}`,
                }))}
                onChange={setSelection}
              />
            </Form.Item>
            {selected && (
              <>
                <div className="resource-blueprint">
                  <p>
                    <code>{selected.id}</code> / {selected.version} · {selected.platform}
                  </p>
                  <CollectionPlan value={selected.presentation} />
                  <details>
                    <summary>{l('完整 Blueprint 定义', 'Complete blueprint definition')}</summary>
                    <CollectionPlan value={selected.definition} />
                  </details>
                </div>
                <Form.Item label={l('新资源标识', 'New resource ID')}>
                  <Input
                    aria-label={l('新资源标识', 'New resource ID')}
                    value={resource}
                    onChange={(event) => setResource(event.target.value)}
                    autoComplete="off"
                  />
                </Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  disabled={
                    !canWrite || !resource || command.pending !== null || command.action.busy
                  }
                >
                  {l('从此精确 Blueprint 创建资源', 'Create resource from this exact blueprint')}
                </Button>
              </>
            )}
          </Form>
        </>
      )}
      <ResourceCommandState command={command} canWrite={canWrite} locale={locale} />
      {command.result && 'versions' in command.result && (
        <>
          <Alert
            type="success"
            title={`${l('已创建资源', 'Resource created')}: ${command.result.id}`}
          />
          <p className="subtitle">
            {l(
              '到资源目录读取精确版本并确认材料；创建不代表资源已激活。',
              'Read its exact version and confirm materials in the resource catalog. Creation does not confirm activation.',
            )}
          </p>
          <CollectionPlan value={command.result} />
        </>
      )}
    </Card>
  )
}
