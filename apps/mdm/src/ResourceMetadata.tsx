import { useState } from 'react'
import { Button, Card, Form, Input } from 'antd'
import type { Resource } from '@rss/mdm-resources'
import { labels } from './AdminUi'
import { CollectionPlan } from './CollectionMappingEditor'
import { ResourceCommandState, useResourceCommand, type ResourcesUseCases } from './ResourceCommand'
import type { Locale } from './i18n'

export function ResourceMetadata({
  resources,
  resource,
  canWrite,
  blocked,
  locale,
}: {
  resources: ResourcesUseCases
  resource: Resource
  canWrite: boolean
  blocked: boolean
  locale: Locale
}) {
  const l = labels(locale),
    command = useResourceCommand(resources),
    [presentation, setPresentation] = useState(resource.presentation),
    fields = [
      ['name', l('显示名称', 'Display name')],
      ['description', l('说明', 'Description')],
      ['publisher', l('发布者', 'Publisher')],
      ['category', l('分类', 'Category')],
    ] as const
  return (
    <Card title={l('资源元数据', 'Resource metadata')}>
      <Form
        layout="vertical"
        disabled={!canWrite || blocked || command.pending !== null}
        onFinish={() =>
          void command.submit(resource.id, resource.revision, { action: 'present', presentation })
        }
      >
        <div className="admin-form-grid">
          {fields.map(([key, label]) => (
            <Form.Item label={label} key={key}>
              <Input
                aria-label={label}
                value={typeof presentation[key] === 'string' ? (presentation[key] as string) : ''}
                onChange={(event) =>
                  setPresentation({ ...presentation, [key]: event.target.value })
                }
              />
            </Form.Item>
          ))}
        </div>
        <details>
          <summary>
            {l('完整元数据（未编辑键原样保留）', 'Complete metadata (unedited keys are preserved)')}
          </summary>
          <CollectionPlan value={presentation} />
        </details>
        <Button htmlType="submit" type="primary">
          {l('保存资源元数据', 'Save resource metadata')}
        </Button>
      </Form>
      <ResourceCommandState command={command} canWrite={canWrite} locale={locale} />
    </Card>
  )
}
