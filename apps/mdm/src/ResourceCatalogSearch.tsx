import { useState } from 'react'
import { Button, Form, Input, Select } from 'antd'
import { formatFilter, parseFilter, type Filter } from '@rss/api/mdm-filter'
import { Failure, firstPage, labels, useAction, validateInput, type Query } from './AdminUi'
import type { Locale } from './i18n'

export interface CatalogLocation {
  params: URLSearchParams
  setParams: (params: URLSearchParams) => void
  canWritePolicy: boolean
  canReadPolicy: boolean
  canReadRuns: boolean
}

export function catalogQuery(params: URLSearchParams): Query {
  const limit = Number(params.get('limit') ?? 20)
  return {
    limit: Number.isSafeInteger(limit) && limit >= 1 && limit <= 1000 ? limit : 20,
    ...(params.get('filter') ? { filter: params.get('filter')! } : {}),
    ...(params.get('cursor') ? { cursor: params.get('cursor')! } : {}),
    ...(params.has('sort') ? { sort: params.getAll('sort') } : {}),
    ...(params.has('field') ? { fields: params.getAll('field') } : {}),
  }
}

export function writeCatalogQuery(params: URLSearchParams, query: Query) {
  const next = new URLSearchParams(params)
  for (const key of ['limit', 'filter', 'cursor', 'sort', 'field']) next.delete(key)
  if (query.limit) next.set('limit', String(query.limit))
  if (query.filter) next.set('filter', query.filter)
  if (query.cursor) next.set('cursor', query.cursor)
  query.sort?.forEach((field) => next.append('sort', field))
  query.fields?.forEach((field) => next.append('field', field))
  return next
}

const compare = (field: string, operator: string, value: string): Filter => ({
  kind: 'compare',
  field,
  operator,
  values: [value],
})

function commonConditions(filter?: string) {
  const fields = { name: '', category: '', active: '' }
  if (!filter) return fields
  try {
    const parsed = parseFilter(filter)
    const parts = parsed.kind === 'and' ? parsed.children : [parsed]
    for (const part of parts) {
      if (part.kind !== 'compare') return null
      const value = part.values[0] ?? ''
      if (part.field === 'presentation.name' && part.operator === '=icontains=' && !fields.name)
        fields.name = value
      else if (part.field === 'presentation.category' && part.operator === '==' && !fields.category)
        fields.category = value
      else if (
        part.field === 'active' &&
        part.operator === '==' &&
        !fields.active &&
        ['true', 'false'].includes(value)
      )
        fields.active = value
      else return null
    }
    return fields
  } catch {
    return null
  }
}

export function ResourceCatalogSearch({
  locale,
  query,
  onChange,
  disabled = false,
}: {
  locale: Locale
  query: Query
  onChange: (query: Query) => void
  disabled?: boolean
}) {
  const l = labels(locale),
    action = useAction(),
    initial = commonConditions(query.filter),
    [name, setName] = useState(initial?.name ?? ''),
    [category, setCategory] = useState(initial?.category ?? ''),
    [active, setActive] = useState(initial?.active ?? '')
  function clear() {
    const next = firstPage(query)
    delete next.filter
    setName('')
    setCategory('')
    setActive('')
    onChange(next)
  }
  return (
    <Form
      layout="inline"
      disabled={disabled}
      onFinish={() =>
        void action.run(async () => {
          const children = [
            ...(name.trim() ? [compare('presentation.name', '=icontains=', name.trim())] : []),
            ...(category.trim() ? [compare('presentation.category', '==', category.trim())] : []),
            ...(active ? [compare('active', '==', active)] : []),
          ]
          if (!children.length) {
            clear()
            return
          }
          let filter = ''
          validateInput(() => {
            filter = formatFilter({ kind: 'and', children })
          })
          onChange({ ...firstPage(query), filter })
        })
      }
    >
      <Form.Item label={l('软件名称', 'Software name')}>
        <Input
          aria-label={l('软件名称', 'Software name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Form.Item>
      <Form.Item label={l('分类', 'Category')}>
        <Input
          aria-label={l('分类', 'Category')}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
      </Form.Item>
      <Form.Item label={l('激活状态', 'Activation status')}>
        <Select
          aria-label={l('激活状态', 'Activation status')}
          value={active}
          onChange={setActive}
          options={[
            { value: '', label: l('全部', 'All') },
            { value: 'true', label: l('有激活版本', 'Has active version') },
            { value: 'false', label: l('无激活版本', 'No active version') },
          ]}
        />
      </Form.Item>
      <Button htmlType="submit" disabled={disabled || !initial}>
        {l('搜索软件', 'Search software')}
      </Button>
      <Button onClick={clear}>{l('清除条件', 'Clear filters')}</Button>
      {!initial && <p>{l('正在应用高级目录条件。', 'Advanced catalog filters are applied.')}</p>}
      <Failure error={action.error} locale={locale} kind="read" />
    </Form>
  )
}
