import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Button, Empty, Form, Input, InputNumber, Select, Space, Spin } from 'antd'
import type { Locale } from './i18n'
export type AdminProps = { locale: Locale }
export function labels(locale: Locale) {
  return (zh: string, en: string) => (locale === 'zh' ? zh : en)
}
export function codeOf(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string')
    return error.code
  return ''
}
export function isUnknown(error: unknown): boolean {
  const e = error && typeof error === 'object' ? error : {}
  const status = 'status' in e && typeof e.status === 'number' ? e.status : 0
  if ('cause' in e && e.cause === 'client') return false
  return (
    !status ||
    status >= 500 ||
    [
      'outcome_unknown',
      'operation_unknown',
      'operation_rollback_unconfirmed',
      'unavailable',
      'identity_unavailable',
      'deadline_exceeded',
    ].includes(codeOf(error))
  )
}
export function Failure({
  error,
  locale,
  kind = 'write',
}: AdminProps & { error: unknown; kind?: 'read' | 'write' }) {
  if (!error) return null
  const l = labels(locale),
    code = codeOf(error)
  const title = [
    'revision_conflict',
    'operation_conflict',
    'conflict',
    'configuration_changed',
  ].includes(code)
    ? l(
        '内容已变化，请重新读取详情后编辑。',
        'Content changed. Read the detail again before editing.',
      )
    : ['forbidden', 'permission_denied', 'insufficient_privilege'].includes(code)
      ? l('当前账户没有此操作权限。', 'Your account cannot perform this operation.')
      : ['reauthentication_required', 'interaction_required'].includes(code)
        ? l(
            '请先到安全设置完成重新认证，再显式提交原操作。',
            'Reauthenticate in Security, then explicitly submit the original operation.',
          )
        : kind === 'read'
          ? l(
              '无法读取当前数据，请检查查询或连接后重新读取。',
              'Cannot read current data. Check the query or connection and read again.',
            )
          : isUnknown(error)
            ? l(
                '结果未确认。请查询原操作；没有查询端点时，仅显式重提原请求。',
                'Outcome unconfirmed. Read the original operation, or explicitly resubmit the original request where no query exists.',
              )
            : l(
                '请求未完成，请检查输入、权限或当前状态。',
                'Request was not completed. Check the input, permissions or current state.',
              )
  return <Alert type="error" showIcon title={title} role="alert" />
}
/** Presentation lifecycle only. Session admission and response fencing stay with the sole owner. */
export function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null)
  const live = useRef(true),
    running = useRef(false)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  async function run<T>(
    work: () => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
    if (running.current || !live.current) return { ok: false, error: new Error('Action busy') }
    running.current = true
    setBusy(true)
    setError(null)
    try {
      const value = await work()
      if (!live.current) return { ok: false, error: new Error('Page left') }
      return { ok: true, value }
    } catch (error) {
      if (live.current) setError(error)
      return { ok: false, error }
    } finally {
      running.current = false
      if (live.current) setBusy(false)
    }
  }
  return { busy, error, run, clear: () => setError(null) }
}
export function useRead<T>(key: string, read: () => Promise<T>) {
  const [version, setVersion] = useState(0)
  const requestKey = `${key}/${version}`
  const [state, setState] = useState<{ key: string; value?: T; error?: unknown; busy: boolean }>({
    key: requestKey,
    busy: true,
  })
  const loader = useRef(read)
  loader.current = read
  useEffect(() => {
    let live = true
    setState({ key: requestKey, busy: true })
    void (async () => {
      try {
        const value = await loader.current()
        if (live) setState({ key: requestKey, value, busy: false })
      } catch (error) {
        if (live) setState({ key: requestKey, error, busy: false })
      }
    })()
    return () => {
      live = false
    }
  }, [requestKey])
  return {
    ...(state.key === requestKey ? state : { key: requestKey, busy: true }),
    reload: () => setVersion((v) => v + 1),
  }
}
export function Heading({
  title,
  hint,
  actions,
}: {
  title: string
  hint?: string
  actions?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {hint && <p className="subtitle">{hint}</p>}
      </div>
      {actions}
    </div>
  )
}
export function ReadState({
  busy,
  error,
  empty,
  locale,
}: AdminProps & { busy: boolean; error?: unknown; empty?: boolean }) {
  const l = labels(locale)
  if (busy)
    return (
      <div className="admin-loading">
        <Spin aria-label={l('正在读取', 'Loading')} />
      </div>
    )
  if (error) return <Failure error={error} locale={locale} kind="read" />
  if (empty)
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={l('没有数据', 'No data')} />
  return null
}
export interface Query {
  filter?: string
  sort?: readonly string[]
  fields?: readonly string[]
  limit?: number
  cursor?: string
}
export function firstPage(query: Query): Query {
  const next = { ...query }
  delete next.cursor
  return next
}
/** The server evaluates filter/sort/projection. Cursor belongs only to this exact query. */
export function DirectoryControls({
  locale,
  query,
  onChange,
  fields,
  sort,
  required = 'id',
  maximum = 1000,
}: AdminProps & {
  query: Query
  onChange: (query: Query) => void
  fields: readonly string[]
  sort: readonly string[]
  required?: string
  maximum?: number
}) {
  const l = labels(locale),
    [filter, setFilter] = useState(query.filter ?? '')
  return (
    <Form
      className="admin-toolbar"
      layout="inline"
      onFinish={() => {
        const rest = firstPage(query)
        delete rest.filter
        onChange({ ...rest, ...(filter ? { filter } : {}) })
      }}
    >
      <Form.Item label={l('服务端筛选', 'Server filter')}>
        <Input
          aria-label={l('服务端筛选', 'Server filter')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={l("字段=='值'", "field=='value'")}
          maxLength={8192}
          allowClear
        />
      </Form.Item>
      <Button htmlType="submit">{l('应用', 'Apply')}</Button>
      <Form.Item label={l('排序', 'Sort')}>
        <Select
          aria-label={l('排序', 'Sort')}
          value={query.sort?.[0]}
          allowClear
          className="admin-select"
          onChange={(value: string | undefined) => {
            const rest = firstPage(query)
            delete rest.sort
            onChange({ ...rest, ...(value ? { sort: [value] } : {}) })
          }}
          options={sort.flatMap((field) => [
            { value: field, label: `${fieldLabel(locale, field)} ↑` },
            { value: `-${field}`, label: `${fieldLabel(locale, field)} ↓` },
          ])}
        />
      </Form.Item>
      <Form.Item label={l('列', 'Columns')}>
        <Select
          aria-label={l('列', 'Columns')}
          mode="multiple"
          className="admin-fields"
          value={[...(query.fields ?? fields)]}
          options={fields.map((field) => ({
            value: field,
            label: fieldLabel(locale, field),
            disabled: field === required,
          }))}
          onChange={(value: string[]) => {
            const rest = firstPage(query)
            onChange({ ...rest, fields: [...new Set([required, ...value])] })
          }}
          maxTagCount="responsive"
        />
      </Form.Item>
      <Form.Item label={l('每页', 'Page size')}>
        <InputNumber
          aria-label={l('每页', 'Page size')}
          min={1}
          max={maximum}
          value={query.limit ?? 20}
          onChange={(limit) => {
            if (limit) {
              const rest = firstPage(query)
              onChange({ ...rest, limit })
            }
          }}
        />
      </Form.Item>
    </Form>
  )
}
export function CursorControls({
  locale,
  next,
  query,
  onChange,
  count,
}: AdminProps & {
  next: string | null
  query: Query
  onChange: (query: Query) => void
  count: number
}) {
  const l = labels(locale)
  return (
    <div className="admin-table-footer">
      <span>
        {l('本页', 'This page')} · {count}
      </span>
      <Space>
        <Button
          disabled={!query.cursor}
          onClick={() => {
            const rest = firstPage(query)
            onChange(rest)
          }}
        >
          {l('返回首页', 'First page')}
        </Button>
        <Button
          disabled={!next}
          onClick={() => {
            if (next) onChange({ ...query, cursor: next })
          }}
        >
          {l('下一页', 'Next page')}
        </Button>
      </Space>
    </div>
  )
}
export function DetailFacts({ children }: { children: ReactNode }) {
  return <div className="admin-detail-facts">{children}</div>
}

const fieldNames: Record<string, readonly [string, string]> = {
  revision: ['版本', 'Revision'],
  subjectKind: ['主体类型', 'Subject type'],
  deleted: ['已删除', 'Deleted'],
  name: ['名称', 'Name'],
  enabled: ['启用', 'Enabled'],
  memberCount: ['成员数', 'Members'],
  revoked: ['已撤销', 'Revoked'],
  expiresAt: ['到期时间', 'Expires at'],
  management: ['管理租户', 'Management tenant'],
  deletable: ['允许删除', 'Deletable'],
  key: ['字段键', 'Field key'],
  sourceKind: ['来源', 'Source'],
  valueType: ['值类型', 'Value type'],
  required: ['完整性必需', 'Required for completeness'],
  memberActive: ['成员有效', 'Active membership'],
  hasLocalPassword: ['本地密码', 'Local password'],
  displayName: ['显示名称', 'Display name'],
  username: ['用户名', 'Username'],
  emailVerified: ['邮箱验证状态', 'Email verified'],
  email: ['邮箱', 'Email'],
  profileStatus: ['资料状态', 'Profile status'],
  departmentStatus: ['部门状态', 'Department status'],
}
export function fieldLabel(locale: Locale, field: string): string {
  const name = fieldNames[field]
  return name ? labels(locale)(name[0], name[1]) : field
}
export function cellText(locale: Locale, value: unknown): string {
  return typeof value === 'boolean'
    ? labels(locale)(value ? '是' : '否', value ? 'Yes' : 'No')
    : String(value ?? '—')
}

/** Validate the selected columns before handing a UI query to a typed domain port. */
export function directoryQuery<F extends string>(
  query: Query,
  allowed: readonly F[],
): Omit<Query, 'fields'> & { fields?: readonly F[] } {
  const { fields, ...rest } = query
  if (fields === undefined) return rest
  if (fields.some((field) => !allowed.includes(field as F)))
    throw new Error('Invalid directory columns')
  return { ...rest, fields: fields.filter((field): field is F => allowed.includes(field as F)) }
}
