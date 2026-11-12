import { createContext, useContext, useEffect, useState } from 'react'
import { Alert, Button, Input, Radio, Select, Space, Tag } from 'antd'
import type { DirectoryCapabilities, DirectoryQuery } from '@rss/mdm-devices'
import { FilterSyntaxError, formatFilter, parseFilter, type Filter } from '@rss/api/mdm-filter'
import type { Locale } from './i18n'

export const DirectoryCatalogContext = createContext<
  Readonly<Record<string, DirectoryCapabilities>>
>({})
type Field = DirectoryCapabilities['fields'][number]
const operators: Record<string, readonly [string, string, string]> = {
  Eq: ['==', '等于', 'Equals'],
  Ne: ['!=', '不等于', 'Not equal'],
  In: ['=in=', '属于任意值', 'Any of'],
  Out: ['=out=', '不属于', 'None of'],
  Lt: ['=lt=', '小于', 'Less than'],
  Le: ['=le=', '小于等于', 'At most'],
  Gt: ['=gt=', '大于', 'Greater than'],
  Ge: ['=ge=', '大于等于', 'At least'],
  Icontains: ['=icontains=', '包含文字（忽略大小写）', 'Contains text (case insensitive)'],
  ContainsAny: ['=containsany=', '包含任意项', 'Contains any'],
  ContainsAll: ['=containsall=', '包含所有项', 'Contains all'],
  IsNull: ['=isnull=', '为空', 'Is null'],
  IsNotNull: ['=isnotnull=', '非空', 'Is not null'],
}
const sets = new Set(['=in=', '=out=', '=containsany=', '=containsall='])
const labels: Record<string, readonly [string, string]> = {
  search: ['名称或序列号', 'Name or serial number'],
  name: ['名称', 'Name'],
  alias: ['策略名称 / 别名', 'Policy name / alias'],
  category: ['分类', 'Category'],
  'presentation.name': ['名称', 'Name'],
  'presentation.category': ['分类', 'Category'],
  'settings.presentation.name': ['名称', 'Name'],
  'configuration.name': ['配置名称', 'Configuration name'],
  'latest.metadata.name': ['名称', 'Name'],
  'latest.metadata.category': ['分类', 'Category'],
  'value.name': ['名称', 'Name'],
  active: ['激活状态', 'Activation'],
  enabled: ['启用状态', 'Enabled'],
  deleted: ['删除状态', 'Deletion'],
  retired: ['归档状态', 'Retirement'],
  revoked: ['撤销状态', 'Revocation'],
  state: ['状态', 'State'],
  status: ['状态', 'State'],
  kind: ['类型', 'Type'],
  platform: ['平台', 'Platform'],
  channel: ['通道', 'Channel'],
  assetContext: ['统计域', 'Asset context'],
  assetState: ['资产状态', 'Asset state'],
  action: ['动作', 'Action'],
  'definition.action.kind': ['动作', 'Action'],
  id: ['标识', 'Identifier'],
  remoteUuid: ['远端 UUID', 'Remote UUID'],
}
const common: Readonly<Record<string, readonly string[]>> = {
  resources: ['presentation.name', 'presentation.category', 'kind', 'active'],
  devices: ['search', 'platform', 'channel', 'status', 'assetState'],
  endpoints: ['id', 'channel', 'status'],
  groups: ['name', 'kind', 'assetContext', 'deleted'],
  policies: ['alias', 'category', 'state', 'action'],
  certificates: ['latest.metadata.name', 'latest.metadata.category', 'retired'],
  webhooks: ['settings.presentation.name', 'enabled', 'deleted'],
  ade: ['configuration.name', 'remoteUuid'],
  compliance: ['name', 'enabled', 'deleted'],
  savedQueries: ['name', 'deleted'],
  userGroups: ['value.name', 'deleted'],
  apiKeys: ['name', 'enabled'],
}
function label(field: Field, locale: Locale) {
  const text = labels[field.name]
  return text ? text[locale === 'zh' ? 0 : 1] : field.name
}
function choices(field: Field): readonly string[] | undefined {
  return field.kind === 'Boolean'
    ? ['true', 'false']
    : typeof field.kind === 'object'
      ? (field.kind['Enum'] ?? field.kind['EnumSet'])
      : undefined
}
function condition(field: Field): Extract<Filter, { kind: 'compare' }> {
  const operator = field.operators.includes('Icontains')
    ? '=icontains='
    : operators[field.operators[0] ?? 'Eq']![0]
  return { kind: 'compare', field: field.name, operator, values: [choices(field)?.[0] ?? ''] }
}
function joined(children: Filter[]): Filter | null {
  return children.length === 0
    ? null
    : children.length === 1
      ? children[0]!
      : { kind: 'and', children }
}
function validate(node: Filter, fields: readonly Field[]) {
  if (node.kind !== 'compare') {
    node.children.forEach((child) => validate(child, fields))
    return
  }
  const field = fields.find((field) => field.name === node.field)
  if (
    !field ||
    !field.filter ||
    !field.operators.some((op) => operators[op]?.[0] === node.operator)
  )
    throw new Error(`Unsupported field or operator: ${node.field}`)
  if (node.operator === '=isnull=' || node.operator === '=isnotnull=') return
  const allowed = choices(field)
  if (allowed && node.values.some((value) => !allowed.includes(value)))
    throw new Error(`Invalid value: ${node.field}`)
  if (
    ['Integer', 'IntegerSet'].includes(String(field.kind)) &&
    node.values.some((value) => !/^-?[0-9]+$/.test(value))
  )
    throw new Error(`Invalid integer: ${node.field}`)
  if (
    ['Number', 'NumberSet'].includes(String(field.kind)) &&
    node.values.some((value) => !value.trim() || !Number.isFinite(Number(value)))
  )
    throw new Error(`Invalid number: ${node.field}`)
}

function ConditionRow({
  node,
  fields,
  locale,
  onChange,
  onRemove,
}: {
  node: Filter
  fields: readonly Field[]
  locale: Locale
  onChange(node: Filter): void
  onRemove(): void
}) {
  const l = (zh: string, en: string) => (locale === 'zh' ? zh : en)
  if (node.kind !== 'compare')
    return (
      <fieldset className="directory-condition-group">
        <legend>{l('条件分组', 'Condition group')}</legend>
        <Space wrap>
          <Radio.Group
            aria-label={l('分组关系', 'Group relation')}
            value={node.kind}
            onChange={(e) => onChange({ ...node, kind: e.target.value as 'and' | 'or' })}
            options={[
              { value: 'and', label: 'AND' },
              { value: 'or', label: 'OR' },
            ]}
          />
          <Button
            onClick={() =>
              onChange({ ...node, children: [...node.children, condition(fields[0]!)] })
            }
          >
            {l('添加条件', 'Add condition')}
          </Button>
          <Button
            onClick={() =>
              onChange({
                ...node,
                children: [...node.children, { kind: 'and', children: [condition(fields[0]!)] }],
              })
            }
          >
            {l('添加分组', 'Add group')}
          </Button>
          <Button onClick={onRemove}>{l('移除分组', 'Remove group')}</Button>
        </Space>
        {node.children.map((child, index) => (
          <ConditionRow
            key={index}
            node={child}
            fields={fields}
            locale={locale}
            onChange={(next) =>
              onChange({
                ...node,
                children: node.children.map((item, i) => (i === index ? next : item)),
              })
            }
            onRemove={() =>
              node.children.length === 1
                ? onRemove()
                : onChange({ ...node, children: node.children.filter((_, i) => i !== index) })
            }
          />
        ))}
      </fieldset>
    )
  const field = fields.find((field) => field.name === node.field),
    allowed = field && choices(field),
    multiple = sets.has(node.operator),
    unary = ['=isnull=', '=isnotnull='].includes(node.operator)
  return (
    <div className="directory-condition-row">
      <Select
        aria-label={l('条件字段', 'Condition field')}
        value={node.field}
        showSearch
        optionFilterProp="label"
        options={fields.map((field) => ({ value: field.name, label: label(field, locale) }))}
        onChange={(name) => onChange(condition(fields.find((field) => field.name === name)!))}
      />
      <Select
        aria-label={l('条件操作符', 'Condition operator')}
        value={node.operator}
        options={(field?.operators ?? []).flatMap((op) =>
          operators[op]
            ? [{ value: operators[op]![0], label: operators[op]![locale === 'zh' ? 1 : 2] }]
            : [],
        )}
        onChange={(operator) =>
          onChange({
            ...node,
            operator,
            values: ['=isnull=', '=isnotnull='].includes(operator)
              ? ['true']
              : unary
                ? [allowed?.[0] ?? '']
                : sets.has(operator)
                  ? node.values
                  : [node.values[0] ?? ''],
          })
        }
      />
      {!unary &&
        (allowed || multiple ? (
          <Select
            aria-label={l('条件值', 'Condition value')}
            {...(multiple ? { mode: allowed ? ('multiple' as const) : ('tags' as const) } : {})}
            value={multiple ? node.values : (node.values[0] ?? '')}
            options={(allowed ?? []).map((value) => ({
              value,
              label: value === 'true' ? l('是', 'Yes') : value === 'false' ? l('否', 'No') : value,
            }))}
            onChange={(value: string | string[]) =>
              onChange({ ...node, values: Array.isArray(value) ? value : [value] })
            }
          />
        ) : (
          <Input
            aria-label={l('条件值', 'Condition value')}
            inputMode={field?.kind === 'Integer' ? 'numeric' : undefined}
            value={node.values[0] ?? ''}
            onChange={(e) => onChange({ ...node, values: [e.target.value] })}
          />
        ))}
      <Button onClick={onRemove}>{l('移除条件', 'Remove condition')}</Button>
    </div>
  )
}

/** Presentation and RSQL authoring only. The existing directory client executes each query. */
export function DirectorySearch({
  catalog,
  query,
  onChange,
  locale,
  disabled = false,
}: {
  catalog: string
  query: DirectoryQuery
  onChange(query: DirectoryQuery): void
  locale: Locale
  disabled?: boolean
}) {
  const capabilities = useContext(DirectoryCatalogContext)[catalog],
    l = (zh: string, en: string) => (locale === 'zh' ? zh : en),
    [draft, setDraft] = useState<Filter | string | null>(query.filter ?? null),
    [mode, setMode] = useState<'visual' | 'text'>('visual'),
    [error, setError] = useState('')
  useEffect(() => {
    setDraft(query.filter ?? null)
    setError('')
  }, [query.filter])
  if (!capabilities)
    return (
      <Alert
        type="error"
        title={l('缺少正式目录查询能力', 'Formal directory capabilities are missing')}
      />
    )
  const fields = capabilities.fields.filter((field) => field.filter),
    specs = (common[catalog] ?? []).flatMap((name) => {
      const field = fields.find((field) => field.name === name)
      return field ? [field] : []
    })
  let tree: Filter | null = null,
    syntax = ''
  try {
    tree = typeof draft === 'string' ? (draft ? parseFilter(draft) : null) : draft
  } catch (error) {
    syntax =
      error instanceof FilterSyntaxError
        ? `${l('位置', 'Position')} ${error.position + 1}: ${error.message}`
        : String(error)
  }
  const parts = tree?.kind === 'and' ? tree.children : tree ? [tree] : []
  function update(next: Filter | null) {
    setDraft(next)
    setError('')
  }
  function changeMode(next: 'visual' | 'text') {
    try {
      if (next === 'text' && typeof draft !== 'string') setDraft(draft ? formatFilter(draft) : '')
      setMode(next)
      setError('')
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    }
  }
  function apply() {
    try {
      const node = typeof draft === 'string' ? (draft ? parseFilter(draft) : null) : draft
      if (node) validate(node, fields)
      const text = typeof draft === 'string' ? draft : node ? formatFilter(node) : ''
      const { cursor: _cursor, filter: _filter, ...rest } = query
      void _cursor
      void _filter
      onChange({ ...rest, ...(text ? { filter: text } : {}) })
      setError('')
    } catch (error) {
      setError(
        error instanceof FilterSyntaxError
          ? `${l('位置', 'Position')} ${error.position + 1}: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error),
      )
    }
  }
  return (
    <fieldset className="directory-search" disabled={disabled}>
      <legend>{l('搜索整个服务端目录', 'Search the entire server directory')}</legend>
      <div className="directory-common-conditions">
        {specs.map((field) => {
          const index = parts.findIndex(
              (part) =>
                part.kind === 'compare' &&
                part.field === field.name &&
                ['==', '=icontains='].includes(part.operator),
            ),
            match = parts[index],
            value = match?.kind === 'compare' ? (match.values[0] ?? '') : '',
            allowed = choices(field)
          const change = (value: string) => {
            const rest = parts.filter((_, i) => i !== index)
            update(
              joined(value === '' ? rest : [...rest, { ...condition(field), values: [value] }]),
            )
          }
          return (
            <label key={field.name}>
              <span>{label(field, locale)}</span>
              {allowed ? (
                <Select
                  aria-label={label(field, locale)}
                  allowClear
                  value={value || undefined}
                  disabled={!!syntax || disabled}
                  options={allowed.map((value) => ({
                    value,
                    label:
                      value === 'true' ? l('是', 'Yes') : value === 'false' ? l('否', 'No') : value,
                  }))}
                  onChange={(value) => change(value ?? '')}
                />
              ) : (
                <Input
                  aria-label={label(field, locale)}
                  value={value}
                  disabled={!!syntax || disabled}
                  allowClear
                  onChange={(e) => change(e.target.value)}
                  onPressEnter={apply}
                />
              )}
            </label>
          )
        })}
      </div>
      {parts.some((part) => part.kind !== 'compare') && (
        <p>
          {l(
            '高级分组保持不变；快捷条件与其按 AND 组合。',
            'Advanced groups are preserved; quick conditions are combined with AND.',
          )}
        </p>
      )}
      <details className="directory-advanced">
        <summary>{l('高级条件 / RSQL', 'Advanced conditions / RSQL')}</summary>
        <Radio.Group
          aria-label={l('条件编辑模式', 'Condition editing mode')}
          value={mode}
          onChange={(e) => changeMode(e.target.value as 'visual' | 'text')}
          options={[
            { value: 'visual', label: l('可视条件', 'Visual conditions') },
            { value: 'text', label: 'RSQL' },
          ]}
        />
        {mode === 'text' ? (
          <>
            <Input.TextArea
              aria-label="RSQL"
              value={typeof draft === 'string' ? draft : ''}
              maxLength={8192}
              rows={4}
              onChange={(e) => setDraft(e.target.value)}
            />
            <p>
              {l('字段与操作符提示', 'Field and operator hints')}:{' '}
              {fields
                .map(
                  (field) =>
                    `${label(field, locale)} (${field.name}): ${field.operators
                      .map((op) => operators[op]?.[0])
                      .filter(Boolean)
                      .join(' ')}`,
                )
                .join(' · ')}
            </p>
          </>
        ) : syntax ? (
          <Alert
            type="warning"
            title={l(
              '表达式已保留，请在 RSQL 模式修正。',
              'Expression preserved. Correct it in RSQL mode.',
            )}
            description={syntax}
          />
        ) : tree ? (
          <ConditionRow
            node={tree}
            fields={fields}
            locale={locale}
            onChange={update}
            onRemove={() => update(null)}
          />
        ) : null}
        {mode === 'visual' && fields.length > 0 && (
          <Space wrap>
            <Button
              disabled={!!syntax}
              onClick={() => update({ kind: 'and', children: [...parts, condition(fields[0]!)] })}
            >
              {l('添加条件', 'Add condition')}
            </Button>
            <Button
              disabled={!!syntax}
              onClick={() =>
                update({
                  kind: 'and',
                  children: [...parts, { kind: 'or', children: [condition(fields[0]!)] }],
                })
              }
            >
              {l('添加分组', 'Add group')}
            </Button>
          </Space>
        )}
      </details>
      {(error || syntax) && <Alert role="alert" type="error" title={error || syntax} />}
      <Space wrap>
        <Button type="primary" onClick={apply}>
          {l('应用', 'Apply')}
        </Button>
        <Button
          onClick={() => {
            setDraft(null)
            setError('')
            const { filter: _filter, cursor: _cursor, ...rest } = query
            void _filter
            void _cursor
            onChange(rest)
          }}
        >
          {l('清除条件', 'Clear filters')}
        </Button>
      </Space>
      {query.filter && (
        <p className="directory-applied">
          <Tag>{l('已应用', 'Applied')}</Tag>
          <code>{query.filter}</code>
        </p>
      )}
    </fieldset>
  )
}
