import { useState } from 'react'
import { Alert, Button, Card, Form, Input, InputNumber, Space } from 'antd'
import type { Assessment, HistoryQuery } from '@rss/mdm-compliance'
import type { ComplianceUseCases } from './ComplianceTask'
import type { Locale } from './i18n'
import { CursorControls, labels, ReadState, useRead } from './AdminUi'
import { DataTable } from './DataTable'
import { CollectionPlan } from './CollectionMappingEditor'
import { Status, timestamp } from './DevicePresentation'

export function AssessmentFacts({
  value,
  locale,
  historical = false,
}: {
  value: Assessment
  locale: Locale
  historical?: boolean
}) {
  const l = labels(locale)
  return (
    <section className="asset-editor-section">
      {historical && <p className="subtitle">{l('历史评估', 'Historical assessment')}</p>}
      <p>
        <Status locale={locale} value={value.status} /> · {value.reason}
      </p>
      <dl className="device-facts">
        <div>
          <dt>{l('规则 / 版本', 'Rule / revision')}</dt>
          <dd>
            {value.ruleId} / {value.ruleVersion}
          </dd>
        </div>
        <div>
          <dt>{l('评估时间', 'Evaluated at')}</dt>
          <dd>{timestamp(locale, value.evaluatedAt)}</dd>
        </div>
        <div>
          <dt>{l('字典版本', 'Dictionary revision')}</dt>
          <dd>{value.dictionaryVersion}</dd>
        </div>
        <div>
          <dt>{l('事实水位', 'Fact watermark')}</dt>
          <dd>{value.factWatermark}</dd>
        </div>
        <div>
          <dt>{l('条件判定', 'Condition decision')}</dt>
          <dd>
            <Status locale={locale} value={value.condition} />
          </dd>
        </div>
      </dl>
      <details>
        <summary>
          {l('适用性、条件路径与精确证据', 'Applicability, condition paths and exact evidence')}
        </summary>
        <CollectionPlan
          value={{
            applicability: value.applicability,
            groupInputs: value.groups,
            explanations: value.explanations,
            fieldEvidence: value.evidence,
          }}
        />
      </details>
    </section>
  )
}
function ComplianceHistory({
  compliance,
  locale,
  device,
}: {
  compliance: ComplianceUseCases
  locale: Locale
  device: string
}) {
  const l = labels(locale),
    [from, setFrom] = useState<number | null>(null),
    [until, setUntil] = useState<number | null>(null),
    [limit, setLimit] = useState(20),
    [query, setQuery] = useState<HistoryQuery>({ limit: 20 }),
    read = useRead(`compliance-history/${device}/${JSON.stringify(query)}`, () =>
      compliance.history(device, query),
    )
  return (
    <Card title={l('合规评估历史', 'Compliance assessment history')}>
      <Form
        layout="inline"
        onFinish={() =>
          setQuery({
            limit,
            ...(from !== null ? { from } : {}),
            ...(until !== null ? { until } : {}),
          })
        }
      >
        <Form.Item label={l('历史每页条目', 'History page size')}>
          <InputNumber
            aria-label={l('历史每页条目', 'History page size')}
            value={limit}
            min={1}
            max={1000}
            precision={0}
            onChange={(value) => {
              if (value) setLimit(value)
            }}
          />
        </Form.Item>
        <Form.Item label={l('开始时间（Unix 秒）', 'From (Unix seconds)')}>
          <InputNumber
            aria-label={l('开始时间（Unix 秒）', 'From (Unix seconds)')}
            value={from}
            precision={0}
            onChange={setFrom}
          />
        </Form.Item>
        <Form.Item label={l('结束时间（Unix 秒）', 'Until (Unix seconds)')}>
          <InputNumber
            aria-label={l('结束时间（Unix 秒）', 'Until (Unix seconds)')}
            value={until}
            precision={0}
            onChange={setUntil}
          />
        </Form.Item>
        <Button htmlType="submit">
          {l('应用时间范围并从首页读取', 'Apply range and read from first page')}
        </Button>
        <Button onClick={read.reload}>{l('读取评估历史', 'Read assessment history')}</Button>
      </Form>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      {read.value && (
        <>
          <DataTable
            locale={locale}
            dataSource={read.value.items}
            rowKey={(row) => `${row.task}/${row.ruleId}`}
            columns={[
              {
                title: l('评估时间', 'Evaluated at'),
                render: (_, row) => timestamp(locale, row.evaluatedAt),
              },
              {
                title: l('规则 / 版本', 'Rule / revision'),
                render: (_, row) => `${row.ruleId} / ${row.ruleVersion}`,
              },
              {
                title: l('历史结论', 'Historical status'),
                render: (_, row) => (
                  <>
                    <Status locale={locale} value={row.status} /> · {row.reason}
                  </>
                ),
              },
              {
                title: l('发布处置', 'Disposition'),
                render: (_, row) => <Status locale={locale} value={row.disposition} />,
              },
              {
                title: l('原任务与证据', 'Original task and evidence'),
                render: (_, row) => (
                  <details>
                    <summary>{row.task}</summary>
                    <AssessmentFacts locale={locale} value={row} historical />
                  </details>
                ),
              },
            ]}
          />
          <CursorControls
            locale={locale}
            next={read.value.nextCursor}
            count={read.value.items.length}
            query={query}
            onChange={(page) => {
              const next = { ...query }
              delete next.cursor
              setQuery({ ...next, ...(page.cursor ? { cursor: page.cursor } : {}) })
            }}
          />
        </>
      )}
      {!!read.error && query.cursor && (
        <Button
          onClick={() => {
            const next = { ...query }
            delete next.cursor
            setQuery(next)
          }}
        >
          {l(
            '历史游标失效，保留时间范围返回首页',
            'History cursor expired; first page with the same bounds',
          )}
        </Button>
      )}
    </Card>
  )
}
export function DeviceCompliance({
  compliance,
  locale,
  device,
}: {
  compliance: ComplianceUseCases
  locale: Locale
  device: string
}) {
  const l = labels(locale),
    read = useRead(`device-compliance/${device}`, () => compliance.current(device))
  return (
    <>
      <Card title={l('设备当前合规', 'Current device compliance')}>
        <Button onClick={read.reload}>
          {l('读取设备当前合规', 'Read current device compliance')}
        </Button>
        <ReadState locale={locale} busy={read.busy} error={read.error} />
        {read.value && (
          <>
            <p>
              <code>{read.value.device}</code> ·{' '}
              <Status locale={locale} value={read.value.status} />
            </p>
            {read.value.reason === 'no_rules' && (
              <Alert
                type="info"
                title={l(
                  '未配置规则，状态未知。',
                  'No rules are configured; the status is unknown.',
                )}
              />
            )}
            {read.value.rules.map((rule) => (
              <Card size="small" key={rule.ruleId} title={`${rule.ruleId} / ${rule.ruleVersion}`}>
                <Status locale={locale} value={rule.status} />
                {rule.current ? (
                  <AssessmentFacts locale={locale} value={rule.current} />
                ) : (
                  <p>
                    {rule.status === 'pending'
                      ? l(
                          '等待当前规则版本的评估。',
                          'Awaiting assessment of the current rule revision.',
                        )
                      : l('尚无当前评估证据。', 'No current assessment evidence.')}
                  </p>
                )}
                {rule.previous && (
                  <details>
                    <summary>
                      {l('此前评估（历史证据）', 'Previous assessment (historical)')}
                    </summary>
                    <AssessmentFacts locale={locale} value={rule.previous} historical />
                  </details>
                )}
              </Card>
            ))}
          </>
        )}
      </Card>
      <div className="admin-subsection">
        <ComplianceHistory key={device} compliance={compliance} locale={locale} device={device} />
      </div>
    </>
  )
}
export function ComplianceDeviceLookup({
  compliance,
  locale,
}: {
  compliance: ComplianceUseCases
  locale: Locale
}) {
  const l = labels(locale),
    [draft, setDraft] = useState(''),
    [device, setDevice] = useState('')
  return (
    <>
      <Card title={l('按终端读取合规事实', 'Read compliance by endpoint')}>
        <Form layout="inline" onFinish={() => setDevice(draft)}>
          <Form.Item label={l('终端标识', 'Endpoint ID')}>
            <Input
              aria-label={l('终端标识', 'Endpoint ID')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </Form.Item>
          <Space>
            <Button htmlType="submit" disabled={!draft}>
              {l('读取此终端合规', 'Read endpoint compliance')}
            </Button>
          </Space>
        </Form>
      </Card>
      {device && (
        <div className="admin-subsection">
          <DeviceCompliance key={device} compliance={compliance} locale={locale} device={device} />
        </div>
      )}
    </>
  )
}
