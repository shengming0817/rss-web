import { Form, Input, Select } from 'antd'
import type { Metadata } from '@rss/mdm-certificates/archive'
import type { Locale } from './i18n'
import { labels } from './AdminUi'
export function emptyArchiveMetadata(): Metadata {
  return { name: '', category: 'custom', owner: '', notes: '', labels: [], usages: [] }
}
export function ArchiveMetadata({
  value,
  onChange,
  locale,
  categories = [],
}: {
  value: Metadata
  onChange: (value: Metadata) => void
  locale: Locale
  categories?: readonly string[]
}) {
  const l = labels(locale)
  return (
    <>
      <div className="admin-form-grid">
        <Form.Item label={l('名称', 'Name')} required>
          <Input
            aria-label={l('证书名称', 'Certificate name')}
            value={value.name}
            maxLength={256}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
          />
        </Form.Item>
        <Form.Item label={l('分类', 'Category')} required>
          <Select
            aria-label={l('证书分类', 'Certificate category')}
            showSearch
            value={value.category}
            options={[...new Set([value.category, ...categories, 'custom'])]
              .filter(Boolean)
              .map((category) => ({ value: category, label: category }))}
            onChange={(category) => onChange({ ...value, category })}
          />
        </Form.Item>
        <Form.Item label={l('负责人', 'Owner')}>
          <Input
            aria-label={l('证书负责人', 'Certificate owner')}
            value={value.owner}
            maxLength={256}
            onChange={(event) => onChange({ ...value, owner: event.target.value })}
          />
        </Form.Item>
        <Form.Item label={l('标签', 'Labels')}>
          <Select
            aria-label={l('证书标签', 'Certificate labels')}
            mode="tags"
            value={[...value.labels]}
            onChange={(labels: string[]) => onChange({ ...value, labels })}
          />
        </Form.Item>
        <Form.Item label={l('用途', 'Usages')}>
          <Select
            aria-label={l('证书用途', 'Certificate usages')}
            mode="tags"
            value={[...value.usages]}
            onChange={(usages: string[]) => onChange({ ...value, usages })}
          />
        </Form.Item>
      </div>
      <Form.Item label={l('备注', 'Notes')}>
        <Input.TextArea
          aria-label={l('证书备注', 'Certificate notes')}
          value={value.notes}
          maxLength={4096}
          rows={3}
          onChange={(event) => onChange({ ...value, notes: event.target.value })}
        />
      </Form.Item>
      <details>
        <summary>
          {l('完整元数据（未编辑键原样保留）', 'Complete metadata (unedited keys are preserved)')}
        </summary>
        <pre className="definition-preview">{JSON.stringify(value, null, 2)}</pre>
      </details>
    </>
  )
}
