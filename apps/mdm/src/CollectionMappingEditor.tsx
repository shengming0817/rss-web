import { useState } from 'react'
import { Alert, Button, Form, Input, Select, Space } from 'antd'
import type { MappingDeclaration } from '@rss/mdm-resources'
import type { Locale } from './i18n'
import { labels } from './AdminUi'
import { emptyMapping, NativeReadEditor, ValueMappingEditor } from './ValueMappingEditor'

/** Read-only source plans stay visible without a JSON text authoring bridge. */
function PlanBranch({ value }: { value: object }) {
  const [expanded, setExpanded] = useState(false),
    keys = Object.keys(value)
  return (
    <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>
        {Array.isArray(value)
          ? `[${value.length}]`
          : keys.slice(0, 5).join(' · ') + (keys.length > 5 ? ` … (${keys.length})` : '')}
      </summary>
      {expanded && <CollectionPlan value={value} />}
    </details>
  )
}
export function CollectionPlan({ value }: { value: unknown }) {
  if (value === null) return <span>—</span>
  if (typeof value !== 'object') return <span>{String(value)}</span>
  return (
    <dl className="device-values">
      {Object.entries(value).map(([key, item]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>
            {item !== null && typeof item === 'object' ? (
              <PlanBranch value={item} />
            ) : (
              <CollectionPlan value={item} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
export function CollectionMappingEditor({
  value,
  onChange,
  locale,
}: {
  value: MappingDeclaration
  onChange: (value: MappingDeclaration) => void
  locale: Locale
}) {
  const l = labels(locale),
    [field, setField] = useState('')
  if (value.kind === 'script' && value.definition.purpose.kind !== 'collection')
    return (
      <Alert
        type="info"
        title={l(
          '此脚本用于动作，没有资产映射。',
          'This script performs an action and has no asset mappings.',
        )}
      />
    )
  const mappings =
    value.kind === 'script' && value.definition.purpose.kind === 'collection'
      ? value.definition.purpose.mappings
      : value.kind !== 'script'
        ? value.definition.mappings
        : {}
  function remove(key: string) {
    if (value.kind === 'agent_collection' || value.kind === 'native_collection') {
      if (value.kind === 'agent_collection') {
        const mappings = { ...value.definition.mappings }
        delete mappings[key]
        onChange({ ...value, definition: { ...value.definition, mappings } })
      } else {
        const mappings = { ...value.definition.mappings }
        delete mappings[key]
        onChange({ ...value, definition: { ...value.definition, mappings } })
      }
    } else if (value.definition.purpose.kind === 'collection') {
      const mappings = { ...value.definition.purpose.mappings }
      delete mappings[key]
      onChange({
        ...value,
        definition: { ...value.definition, purpose: { ...value.definition.purpose, mappings } },
      })
    }
  }
  return (
    <>
      <details className="asset-editor-section">
        <summary>
          {l('保留的采集定义与物理计划', 'Preserved collection definition and physical plan')}
        </summary>
        <CollectionPlan
          value={
            value.kind === 'script'
              ? {
                  ...value.definition,
                  purpose: { ...value.definition.purpose, mappings: undefined },
                }
              : { ...value.definition, mappings: undefined }
          }
        />
      </details>
      {Object.keys(mappings).map((key) => {
        if (value.kind === 'agent_collection') {
          const binding = value.definition.mappings[key]!
          return (
            <details className="asset-editor-section" open key={key}>
              <summary>{key}</summary>
              <Form.Item label={l('物理查询', 'Physical query')}>
                <Select
                  aria-label={`${l('物理查询', 'Physical query')} ${key}`}
                  value={binding.query}
                  options={[
                    ...new Set([...Object.keys(value.definition.plan.queries), binding.query]),
                  ].map((value) => ({ value, label: value }))}
                  onChange={(query) =>
                    onChange({
                      ...value,
                      definition: {
                        ...value.definition,
                        mappings: { ...value.definition.mappings, [key]: { ...binding, query } },
                      },
                    })
                  }
                />
              </Form.Item>
              <Form.Item label={l('缺失处理', 'Missing handling')}>
                <Select
                  aria-label={`${l('缺失处理', 'Missing handling')} ${key}`}
                  value={binding.missing}
                  options={[
                    { value: 'missing', label: l('标记缺失', 'Mark missing') },
                    { value: 'null', label: l('空值', 'Null') },
                    { value: 'delete', label: l('删除', 'Delete') },
                  ]}
                  onChange={(missing: typeof binding.missing) =>
                    onChange({
                      ...value,
                      definition: {
                        ...value.definition,
                        mappings: { ...value.definition.mappings, [key]: { ...binding, missing } },
                      },
                    })
                  }
                />
              </Form.Item>
              <Form.Item label={l('计数规范化', 'Counter normalization')}>
                <Select
                  aria-label={`${l('计数规范化', 'Counter normalization')} ${key}`}
                  value={binding.counterNormalization ?? 'none'}
                  options={[
                    { value: 'none', label: l('不规范化', 'None') },
                    { value: 'local_cumulative_v1', label: 'local_cumulative_v1' },
                  ]}
                  onChange={(normalization: 'none' | 'local_cumulative_v1') =>
                    onChange({
                      ...value,
                      definition: {
                        ...value.definition,
                        mappings: {
                          ...value.definition.mappings,
                          [key]: {
                            ...binding,
                            counterNormalization: normalization === 'none' ? null : normalization,
                          },
                        },
                      },
                    })
                  }
                />
              </Form.Item>
              <ValueMappingEditor
                locale={locale}
                value={binding.mapping}
                onChange={(mapping) =>
                  onChange({
                    ...value,
                    definition: {
                      ...value.definition,
                      mappings: { ...value.definition.mappings, [key]: { ...binding, mapping } },
                    },
                  })
                }
              />
              <Button onClick={() => remove(key)}>
                {l('移除字段映射', 'Remove field mapping')}
              </Button>
            </details>
          )
        }
        if (value.kind === 'native_collection') {
          const binding = value.definition.mappings[key]!
          return (
            <details className="asset-editor-section" open key={key}>
              <summary>{key}</summary>
              <NativeReadEditor
                locale={locale}
                value={binding.query}
                onChange={(query) =>
                  onChange({
                    ...value,
                    definition: {
                      ...value.definition,
                      mappings: { ...value.definition.mappings, [key]: { ...binding, query } },
                    },
                  })
                }
              />
              <ValueMappingEditor
                locale={locale}
                value={binding.mapping}
                onChange={(mapping) =>
                  onChange({
                    ...value,
                    definition: {
                      ...value.definition,
                      mappings: { ...value.definition.mappings, [key]: { ...binding, mapping } },
                    },
                  })
                }
              />
              <Button onClick={() => remove(key)}>
                {l('移除字段映射', 'Remove field mapping')}
              </Button>
            </details>
          )
        }
        const purpose = value.definition.purpose
        if (purpose.kind !== 'collection') return null
        return (
          <details className="asset-editor-section" open key={key}>
            <summary>{key}</summary>
            <ValueMappingEditor
              locale={locale}
              value={purpose.mappings[key]!}
              onChange={(mapping) =>
                onChange({
                  ...value,
                  definition: {
                    ...value.definition,
                    purpose: { ...purpose, mappings: { ...purpose.mappings, [key]: mapping } },
                  },
                })
              }
            />
            <Button onClick={() => remove(key)}>{l('移除字段映射', 'Remove field mapping')}</Button>
          </details>
        )
      })}
      <Space wrap>
        <Input
          aria-label={l('映射字段键', 'Mapping field key')}
          value={field}
          onChange={(e) => setField(e.target.value)}
        />
        <Button
          disabled={
            !field ||
            Object.hasOwn(mappings, field) ||
            (value.kind === 'agent_collection' &&
              !Object.keys(value.definition.plan.queries).length)
          }
          onClick={() => {
            if (value.kind === 'agent_collection')
              onChange({
                ...value,
                definition: {
                  ...value.definition,
                  mappings: {
                    ...value.definition.mappings,
                    [field]: {
                      query: Object.keys(value.definition.plan.queries)[0]!,
                      missing: 'missing',
                      mapping: emptyMapping(),
                    },
                  },
                },
              })
            else if (value.kind === 'native_collection')
              onChange({
                ...value,
                definition: {
                  ...value.definition,
                  mappings: {
                    ...value.definition.mappings,
                    [field]: {
                      query:
                        value.definition.adapter === 'windows_read'
                          ? { kind: 'scalar', uri: '' }
                          : '',
                      mapping: emptyMapping(),
                    },
                  },
                },
              })
            else if (value.definition.purpose.kind === 'collection')
              onChange({
                ...value,
                definition: {
                  ...value.definition,
                  purpose: {
                    ...value.definition.purpose,
                    mappings: { ...value.definition.purpose.mappings, [field]: emptyMapping() },
                  },
                },
              })
            setField('')
          }}
        >
          {l('添加字段映射', 'Add field mapping')}
        </Button>
      </Space>
    </>
  )
}
