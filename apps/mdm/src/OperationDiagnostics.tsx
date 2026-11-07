import { useState, type ReactNode } from 'react'
import { Alert, Button, Card, Descriptions, Form, Input, Select, Space } from 'antd'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type {
  DiagnosticPage,
  DiagnosticsContext,
  Evidence,
  OperationDetail,
  OperationDiagnostics as Diagnostics,
  ReceiptSummary,
  ExecutionEvidence,
} from '@rss/mdm-audit'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { codeOf, CursorControls, Failure, Heading, labels, ReadState, usePageRead } from './AdminUi'
import { AuditFactView } from './AuditFacts'
import { useAuditFactFilter } from './AuditFactFilter'
import { DiagnosticReference } from './DiagnosticReference'
import {
  diagnosticsPath,
  readDiagnosticSelection,
  type DiagnosticSelection,
} from './diagnostic-context'
import { localDate, recordedTime } from './audit-context'
import { Status, timestamp } from './DevicePresentation'
import { useAdministration } from './useAdministration'

function Facts({
  page,
  context,
  locale,
}: {
  page: DiagnosticPage
  context: DiagnosticsContext
  locale: Locale
}) {
  const l = labels(locale)
  const filter = useAuditFactFilter(locale)
  const rows = page.items.filter(({ fact }) => filter.matches(fact))
  return (
    <>
      <p>
        {page.coverage.complete
          ? l('本次读取未观察到索引缺口。', 'No index gaps were observed in this read.')
          : l('索引覆盖不完整。', 'Index coverage is incomplete.')}
      </p>
      {page.items.length > 0 && filter.controls}
      {rows.length === 0 && (
        <p>
          {page.items.length === 0
            ? l(
                '没有可见证据。提交结果仍需核实。',
                'No visible evidence. The submission outcome may still be unknown.',
              )
            : l('本页没有符合筛选的事实。', 'No facts match these filters on this page.')}
        </p>
      )}
      {rows.map(({ fact, operation, operationConfirmed }) => (
        <details key={`${fact.source}/${fact.position}/${fact.eventId}`}>
          <summary>
            {fact.action} · {fact.target.id} · {timestamp(locale, fact.recordedAt)}
          </summary>
          <AuditFactView fact={fact} locale={locale} diagnosticsContext={context} />
          {operation && (
            <p>
              {operationConfirmed
                ? l('已有持久操作关联', 'Durable operation association')
                : l('仅观察到请求尝试', 'Request attempt observed only')}
              {' · '}
              <DiagnosticReference
                locale={locale}
                context={context}
                selection={{ mode: 'operation', address: operation }}
              />
            </p>
          )}
        </details>
      ))}
    </>
  )
}

function Section<T>({
  title,
  value,
  locale,
  children,
}: {
  title: string
  value: Evidence<T>
  locale: Locale
  children: (result: T) => ReactNode
}) {
  const l = labels(locale)
  const messages = {
    not_requested: l('尚未请求此证据。', 'This evidence has not been requested.'),
    not_found: l(
      '未找到可见记录，提交结果可能仍未知。',
      'No visible record was found. The submission outcome may still be unknown.',
    ),
    no_durable_evidence: l(
      '此操作没有可查询的持久证据。',
      'This operation has no durable evidence available to query.',
    ),
    restricted: l('当前权限无法读取此证据。', 'Current permissions restrict this evidence.'),
    unavailable: l('当前无法读取此证据。', 'This evidence is currently unavailable.'),
    expired: l('原记录已过期。', 'The original record has expired.'),
  }
  return (
    <Card title={title}>
      {value.availability === 'available' ? (
        children(value.value)
      ) : (
        <p>{messages[value.availability]}</p>
      )}
    </Card>
  )
}

function Receipt({ result, locale }: { result: ReceiptSummary; locale: Locale }) {
  const l = labels(locale)
  return (
    <Descriptions column={1} size="small">
      <Descriptions.Item label={l('操作编号', 'Operation ID')}>
        {result.operationId}
      </Descriptions.Item>
      {result.object !== null && (
        <Descriptions.Item label={l('原对象', 'Original object')}>
          {result.object}
        </Descriptions.Item>
      )}
      {result.revision !== null && (
        <Descriptions.Item label={l('原版本', 'Original revision')}>
          {result.revision}
        </Descriptions.Item>
      )}
      {result.state !== null && (
        <Descriptions.Item label={l('原业务状态', 'Original business state')}>
          <Status locale={locale} value={result.state} />
        </Descriptions.Item>
      )}
      {result.accepted !== null && (
        <Descriptions.Item label={l('服务端受理', 'Server acceptance')}>
          {result.accepted ? l('已受理', 'Accepted') : l('未受理', 'Not accepted')}
        </Descriptions.Item>
      )}
      {result.enabled !== null && (
        <Descriptions.Item label={l('原启用状态', 'Original enabled status')}>
          {result.enabled ? l('已启用', 'Enabled') : l('未启用', 'Disabled')}
        </Descriptions.Item>
      )}
      {result.recordedAt !== null && (
        <Descriptions.Item label={l('原记录时间', 'Original recording time')}>
          {timestamp(locale, result.recordedAt)}
        </Descriptions.Item>
      )}
      {result.completedAt !== null && (
        <Descriptions.Item label={l('原完成时间', 'Original completion time')}>
          {timestamp(locale, result.completedAt)}
        </Descriptions.Item>
      )}
      {result.executions.length > 0 && (
        <Descriptions.Item label={l('关联执行编号', 'Related execution IDs')}>
          {result.executions.join(' · ')}
        </Descriptions.Item>
      )}
      {result.stages.map((stage, i) => (
        <Descriptions.Item key={i} label={stage.phase}>
          {[stage.state, stage.revision].filter((value) => value !== null).join(' · ')}
        </Descriptions.Item>
      ))}
    </Descriptions>
  )
}

function Execution({ value, locale }: { value: ExecutionEvidence; locale: Locale }) {
  const l = labels(locale)
  return (
    <Descriptions column={1} size="small">
      <Descriptions.Item label={l('执行来源', 'Execution source')}>{value.owner}</Descriptions.Item>
      {value.delivery && (
        <Descriptions.Item label={l('投递与设备接收', 'Delivery and device receipt')}>
          <Status locale={locale} value={value.delivery} />
        </Descriptions.Item>
      )}
      {value.state && (
        <Descriptions.Item label={l('执行进度', 'Execution progress')}>
          <Status locale={locale} value={value.state} />
        </Descriptions.Item>
      )}
      <Descriptions.Item label={l('设备效果', 'Device effect')}>
        {value.effect ? (
          <Status locale={locale} value={value.effect} />
        ) : (
          l('没有效果结论', 'No effect conclusion')
        )}
        {value.reason && ` · ${value.reason}`}
      </Descriptions.Item>
      {value.stages?.map((stage, i) => (
        <Descriptions.Item key={i} label={stage.name}>
          {stage.state}
          {stage.effect && ` · ${stage.effect}`}
        </Descriptions.Item>
      ))}
    </Descriptions>
  )
}

function currentResource(detail: OperationDetail): string | null {
  if (!detail.hasCurrentResource || detail.originalResult.availability !== 'available') return null
  const id = detail.originalResult.value.object
  if (!id) return null
  const owner = detail.operation.owner
  const object = encodeURIComponent(id)
  switch (owner) {
    case 'resource':
      return `/resources?resource=${object}`
    case 'policy':
      return `/policies?policy=${object}`
    case 'scope':
      return `/scopes?scope=${object}`
    case 'tenant_administration':
      return `/platform/tenants?tenant=${object}`
    default:
      return null
  }
}

function Results({
  selection,
  client,
  binding,
  context,
  locale,
}: {
  selection: DiagnosticSelection
  client: Diagnostics
  binding: string
  context: DiagnosticsContext
  locale: Locale
}) {
  const l = labels(locale)
  const [includeAudit, setIncludeAudit] = useState(false)
  const [cursor, setCursor] = useState<string>()
  const read = usePageRead(
    JSON.stringify([binding, context, selection, includeAudit, cursor]),
    async (signal) => {
      const window = cursor ? { cursor } : {}
      switch (selection.mode) {
        case 'discover':
          return {
            kind: 'list' as const,
            page: await client.search({ ...selection.query, ...window }, signal),
          }
        case 'request':
          return { kind: 'list' as const, page: await client.request(selection.id, window, signal) }
        case 'operation':
          return {
            kind: 'detail' as const,
            detail: await client.operation(selection.address, { includeAudit, ...window }, signal),
          }
      }
    },
    { retryReadConflict: false },
  )
  const value = read.value
  const detail = value?.kind === 'detail' ? value.detail : undefined
  const page = value?.kind === 'list' ? value.page : undefined
  const audit =
    detail?.auditEvidence.availability === 'available' ? detail.auditEvidence.value : undefined
  const request =
    detail?.requestEvidence.availability === 'available' ? detail.requestEvidence.value : undefined
  const resource = detail ? currentResource(detail) : null
  const denied = ['permission_denied', 'forbidden', 'unauthorized'].includes(codeOf(read.error))
  return (
    <>
      {selection.mode === 'operation' && (
        <Space wrap>
          <Button
            onClick={() => {
              setCursor(undefined)
              setIncludeAudit(!includeAudit)
            }}
          >
            {includeAudit
              ? l('仅查询原结果', 'Read original result only')
              : l('读取请求与审计证据', 'Read request and audit evidence')}
          </Button>
        </Space>
      )}
      <ReadState busy={read.busy} locale={locale} />
      <Failure kind="read" locale={locale} diagnosticContext={context} error={read.error} />
      {read.error != null && !denied && (
        <Button onClick={() => (cursor ? setCursor(undefined) : read.reload())}>
          {cursor ? l('从首页重新查询', 'Restart from first page') : l('重新读取', 'Read again')}
        </Button>
      )}
      {page && (
        <Card
          title={
            selection.mode === 'request'
              ? l('请求尝试与关联证据', 'Request attempts and associated evidence')
              : l('发现的操作事实', 'Discovered operation facts')
          }
        >
          <Facts locale={locale} page={page} context={context} />
        </Card>
      )}
      {detail && (
        <>
          <Section
            title={l('原操作结果', 'Original operation result')}
            value={detail.originalResult}
            locale={locale}
          >
            {(result) => <Receipt result={result} locale={locale} />}
          </Section>
          {resource && <Link to={resource}>{l('打开当前对象', 'Open current object')}</Link>}
          <Section
            title={l('请求尝试', 'Request attempts')}
            value={detail.requestEvidence}
            locale={locale}
          >
            {(facts) => <Facts locale={locale} context={context} page={facts} />}
          </Section>
          <Section
            title={l('审计证据', 'Audit evidence')}
            value={detail.auditEvidence}
            locale={locale}
          >
            {(facts) => <Facts locale={locale} context={context} page={facts} />}
          </Section>
          <Section
            title={l('执行证据', 'Execution evidence')}
            value={detail.executionEvidence}
            locale={locale}
          >
            {(evidence) => <Execution locale={locale} value={evidence} />}
          </Section>
        </>
      )}
      {(page || request || audit) && (
        <CursorControls
          locale={locale}
          query={{ cursor }}
          next={page?.nextCursor ?? request?.nextCursor ?? audit?.nextCursor ?? null}
          count={page?.items.length ?? (request?.items.length ?? 0) + (audit?.items.length ?? 0)}
          onChange={(query) => setCursor(query.cursor)}
        />
      )}
    </>
  )
}

function LocatorForm({
  context,
  selection,
  locale,
}: {
  context: DiagnosticsContext
  selection: DiagnosticSelection | null
  locale: Locale
}) {
  const l = labels(locale)
  const navigate = useNavigate()
  const [mode, setMode] = useState<DiagnosticSelection['mode']>(selection?.mode ?? 'discover')
  const [invalid, setInvalid] = useState(false)
  const initial =
    selection?.mode === 'operation'
      ? selection.address
      : selection?.mode === 'request'
        ? { requestId: selection.id }
        : {
            ...selection?.query,
            from: localDate(selection?.query.from),
            until: localDate(selection?.query.until),
          }
  return (
    <Card title={l('定位操作', 'Locate an operation')}>
      <Form<Record<string, string>>
        layout="vertical"
        initialValues={initial}
        onFinish={(values) => {
          try {
            const params = new URLSearchParams({ mode })
            for (const [key, value] of Object.entries(values))
              if (typeof value === 'string' || typeof value === 'number')
                params.set(key, String(value))
            if (mode === 'discover') {
              for (const key of ['from', 'until'] as const) {
                const seconds = recordedTime(values[key])
                if (seconds !== undefined) params.set(key, String(seconds))
              }
            }
            const lookup = readDiagnosticSelection(params)
            if (!lookup) throw new Error('Missing lookup')
            navigate(diagnosticsPath(context, lookup))
            setInvalid(false)
          } catch {
            setInvalid(true)
          }
        }}
      >
        <Form.Item label={l('定位方式', 'Lookup method')}>
          <Select
            aria-label={l('定位方式', 'Lookup method')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'discover', label: l('发现操作', 'Discover operations') },
              { value: 'request', label: l('HTTP 请求编号', 'HTTP request ID') },
              { value: 'operation', label: l('精确操作', 'Exact operation') },
            ]}
          />
        </Form.Item>
        <div className="admin-form-grid">
          {(mode === 'request'
            ? [['requestId', l('HTTP 请求编号', 'HTTP request ID')]]
            : mode === 'operation'
              ? [
                  ['owner', l('操作 owner', 'Operation owner')],
                  ['operationId', l('原操作编号', 'Original operation ID')],
                  ['device', l('设备', 'Device')],
                  ['target', l('原对象', 'Original object')],
                  ['actor', l('原主体', 'Original actor')],
                  ['instance', l('原实例', 'Original instance')],
                  ['registration', l('原注册', 'Original registration')],
                  ['generation', l('原代次', 'Original generation')],
                ]
              : [
                  ['targetType', l('对象类型', 'Object type')],
                  ['targetId', l('对象编号', 'Object ID')],
                  ['device', l('设备', 'Device')],
                  ['actor', l('主体', 'Actor')],
                  ['operationId', l('原操作编号', 'Original operation ID')],
                  ['from', l('记录时间从', 'Recorded from')],
                  ['until', l('记录时间至（不含）', 'Recorded until (exclusive)')],
                ]
          ).map(([name, label]) => (
            <Form.Item key={name} name={name!} label={label} preserve={false}>
              <Input
                maxLength={256}
                autoComplete="off"
                type={name === 'from' || name === 'until' ? 'datetime-local' : 'text'}
              />
            </Form.Item>
          ))}
        </div>
        {invalid && (
          <Alert
            type="error"
            role="alert"
            title={l('请核对定位和时间范围。', 'Check the locator and time range.')}
          />
        )}
        <Button type="primary" htmlType="submit">
          {l('查询操作', 'Query operations')}
        </Button>
      </Form>
    </Card>
  )
}

export function OperationDiagnostics({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { operationDiagnostics, binding } = useAdministration(runtime)
  const context = runtime.management ? 'management' : params.get('context') === 'da' ? 'da' : 'mdm'
  const client = operationDiagnostics[context]
  let selection: DiagnosticSelection | null = null
  let invalid = false
  try {
    selection = readDiagnosticSelection(params)
  } catch {
    invalid = true
  }
  const key = `${binding}/${context}/${params.toString()}`
  return (
    <>
      <Heading
        title={l('操作排障', 'Operation diagnostics')}
        hint={l(
          '查询原请求、服务端结果和设备证据。受理、执行和设备效果分别核实。',
          'Read original requests, server results and device evidence. Acceptance, execution and device effect are verified separately.',
        )}
      />
      {context !== 'management' && (
        <Select
          aria-label={l('认证上下文', 'Authentication context')}
          value={context}
          onChange={(value: 'mdm' | 'da') => navigate(diagnosticsPath(value))}
          options={[
            { value: 'mdm', label: l('主 MDM', 'Main MDM') },
            { value: 'da', label: 'Device Access' },
          ]}
        />
      )}
      {invalid && (
        <Alert
          type="error"
          role="alert"
          title={l('定位无效。请重新输入。', 'Invalid locator. Enter it again.')}
        />
      )}
      <LocatorForm key={`form/${key}`} context={context} selection={selection} locale={locale} />
      {client && selection && (
        <Results
          key={`result/${key}`}
          client={client}
          selection={selection}
          binding={binding}
          context={context}
          locale={locale}
        />
      )}
    </>
  )
}
