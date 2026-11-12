import { useTelemetryRead } from './telemetry-read'
import { variantKey } from '@rss/mdm-resources'
import { useEffect, useState } from 'react'
import { Alert, Button, Card, Space, Tag } from 'antd'
import { Link } from 'react-router-dom'
import type { Configuration } from '@rss/mdm-telemetry'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { labels, ReadState } from './AdminUi'
import { useAdministration } from './useAdministration'
import { useSecretVisibility } from './SecretTabs'
import { DataTable } from './DataTable'
import { PolicyPreview } from './PolicyPreview'
import { utcMicros } from './telemetry-format'
function ConfigurationPreview({
  runtime,
  locale,
  value,
}: {
  runtime: Runtime
  locale: Locale
  value: Configuration
}) {
  const l = labels(locale),
    { resources, policies, binding } = useAdministration(runtime),
    exact = value.resource,
    resource = useTelemetryRead(
      `${binding}/telemetry-resource/${JSON.stringify(exact)}`,
      async () => {
        const result = await resources.read(exact.resource),
          version = result.versions.find((v) => v.id === exact.version),
          variant = version?.variants.find(
            (v) =>
              v.key === exact.variant &&
              v.platform === exact.platform &&
              v.architecture === exact.architecture,
          )
        if (
          result.kind !== 'telemetry_profile' ||
          !version ||
          variant?.declaration.kind !== 'telemetry_profile'
        )
          throw new Error('Exact telemetry profile unavailable')
        return {
          name:
            typeof result.presentation['name'] === 'string'
              ? result.presentation['name']
              : result.id,
          definition: variant.declaration.definition,
          state: version.state,
        }
      },
    ),
    policy = useTelemetryRead(`${binding}/telemetry-policy/${value.policyId}`, () =>
      policies.read(value.policyId),
    )
  return (
    <div className="admin-stack telemetry-preview">
      <Card title={l('精确采集方案预览', 'Exact collection plan preview')}>
        <ReadState locale={locale} busy={resource.busy} error={resource.error} />
        <p className="telemetry-coordinate">
          <code>
            {exact.resource} / {exact.version} / {exact.variant} · {exact.platform} /{' '}
            {exact.architecture}
          </code>
        </p>
        {resource.value && (
          <>
            <h3>{resource.value.name}</h3>
            <Tag>{resource.value.state}</Tag>
            <dl className="device-facts">
              <div>
                <dt>{l('采样 / 上传（毫秒）', 'Sample / upload (milliseconds)')}</dt>
                <dd>
                  {resource.value.definition.sampleMillis} /{' '}
                  {resource.value.definition.uploadMillis}
                </dd>
              </div>
              <div>
                <dt>{l('投影位置', 'Projection')}</dt>
                <dd>{resource.value.definition.projection}</dd>
              </div>
              <div>
                <dt>{l('回填期限（秒）', 'Backfill age (seconds)')}</dt>
                <dd>{resource.value.definition.backfillSeconds}</dd>
              </div>
              <div>
                <dt>{l('精确模板', 'Exact template')}</dt>
                <dd>
                  <code>{Object.values(resource.value.definition.template).join(' / ')}</code>
                </dd>
              </div>
            </dl>
            <DataTable
              locale={locale}
              rowKey="key"
              dataSource={resource.value.definition.fields}
              columns={[
                { title: l('字段键', 'Field key'), dataIndex: 'key' },
                { title: l('定义版本', 'Definition version'), dataIndex: 'version' },
              ]}
            />
            <details>
              <summary>{l('模板参数与预算', 'Template parameters and budget')}</summary>
              <pre className="telemetry-value">
                {JSON.stringify(
                  {
                    parameters: resource.value.definition.parameters,
                    budget: resource.value.definition.budget,
                    boost: resource.value.definition.boost,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
            <Link
              to={`/resources?${new URLSearchParams({ resource: exact.resource, version: exact.version, variant: variantKey({ key: exact.variant, platform: exact.platform, architecture: exact.architecture }), platform: exact.platform, architecture: exact.architecture })}`}
            >
              {l('在资源库打开精确方案', 'Open exact plan in Resources')}
            </Link>
          </>
        )}
      </Card>
      <Card title={l('关联策略与范围', 'Associated policy and scope')}>
        <p className="subtitle">
          {l(
            '配置发现绑定的执行版本与当前策略分开显示；普通来源推进不表示需要重新执行。',
            'The discovered execution version and current policy are separate. Ordinary source advancement does not require re-execution.',
          )}
        </p>
        <p>
          {l('发现的执行版本', 'Discovered execution version')} ·{' '}
          <code>{value.policyVersionId}</code>
        </p>
        <ReadState locale={locale} busy={policy.busy} error={policy.error} />
        {policy.value && (
          <>
            <Space wrap>
              <Link
                to={`/policies?${new URLSearchParams({ policy: value.policyId, tab: 'definition' })}`}
              >
                {policy.value.definition.alias ?? value.policyId}
              </Link>
              <Link to={`/scopes?${new URLSearchParams({ scope: policy.value.definition.scope })}`}>
                {l('策略范围', 'Policy scope')}
              </Link>
            </Space>
            <p>
              {l('当前配置修订 / 执行版本', 'Current configuration revision / execution version')} ·{' '}
              {policy.value.revision} / {policy.value.version}
            </p>
            <PolicyPreview
              policies={policies}
              definition={policy.value.definition}
              locale={locale}
            />
          </>
        )}
      </Card>
    </div>
  )
}
export function TelemetryConfigurations({
  runtime,
  locale,
  device,
  canResource,
  canPolicy,
}: {
  runtime: Runtime
  locale: Locale
  device: string
  canResource: boolean
  canPolicy: boolean
}) {
  const l = labels(locale),
    { telemetry, binding } = useAdministration(runtime),
    visible = useSecretVisibility(),
    [selected, setSelected] = useState<Configuration | null>(null),
    read = useTelemetryRead(`${binding}/telemetry-configurations/${device}/${visible}`, () =>
      visible ? telemetry.configurations(device) : Promise.resolve(null),
    )
  useEffect(() => {
    if (!visible) setSelected(null)
  }, [visible])
  if (!visible) return null
  return (
    <div className="admin-stack">
      <Card
        title={l('当前可发现的配置', 'Currently discoverable configurations')}
        extra={
          <Button
            onClick={() => {
              setSelected(null)
              read.reload()
            }}
          >
            {l('重新读取配置', 'Read configurations again')}
          </Button>
        }
      >
        <p className="subtitle">
          {l(
            '这是服务器评估的采集资格与精确方案，不是设备接收回执或采样完成证明。',
            'These are server-evaluated collection qualifications and exact plans, not device acknowledgements or evidence of completed sampling.',
          )}
        </p>
        <ReadState
          locale={locale}
          busy={read.busy}
          error={read.error}
          empty={read.value?.configurations.length === 0}
        />
        {read.value && (
          <>
            <dl className="device-facts">
              <div>
                <dt>{l('评估时间（UTC）', 'Evaluated (UTC)')}</dt>
                <dd>{utcMicros(read.value.evaluatedAtMicros)}</dd>
              </div>
              <div>
                <dt>{l('设备', 'Device')}</dt>
                <dd>
                  {read.value.device}
                </dd>
              </div>
            </dl>
            <DataTable
              locale={locale}
              rowKey={(r, i) => `${r.policyVersionId}/${r.resource.version}/${i}`}
              dataSource={read.value.configurations}
              columns={[
                {
                  title: l('方案', 'Plan'),
                  render: (_, r) => (
                    <>
                      <code>{r.resource.resource}</code>
                      <br />
                      <span>
                        {r.resource.platform} · {r.resource.variant}
                      </span>
                    </>
                  ),
                },
                {
                  title: l('来源 / 投影', 'Source / projection'),
                  render: (_, r) => `${r.source} / ${r.projection}`,
                },
                {
                  title: l(
                    '采样 / 常规采样 / 上传（毫秒）',
                    'Sample / normal sample / upload (ms)',
                  ),
                  render: (_, r) =>
                    `${r.sampleMillis} / ${r.normalSampleMillis} / ${r.uploadMillis}`,
                },
                {
                  title: l('加速到期（UTC）', 'Boost expiry (UTC)'),
                  render: (_, r) =>
                    r.boostExpiresAt === null
                      ? '—'
                      : new Date(r.boostExpiresAt * 1000).toISOString(),
                },
                {
                  title: l('采集支持', 'Collection support'),
                  render: (_, r) => (
                    <Tag color={r.supported ? 'success' : 'warning'}>
                      {r.supported ? l('支持', 'Supported') : l('不支持', 'Unsupported')}
                    </Tag>
                  ),
                },
                {
                  title: l('预览', 'Preview'),
                  render: (_, r) => (
                    <Button disabled={!canResource || !canPolicy} onClick={() => setSelected(r)}>
                      {l('预览精确配置', 'Preview exact configuration')}
                    </Button>
                  ),
                },
              ]}
            />
          </>
        )}
      </Card>
      {selected && read.value && (
        <>
          <Alert
            type="info"
            title={l(
              '采样定义在资源库维护，分配在策略中维护。',
              'Sampling definitions are maintained in Resources; assignments are maintained in Policies.',
            )}
          />
          <ConfigurationPreview
            key={JSON.stringify(selected)}
            runtime={runtime}
            locale={locale}
            value={selected}
          />
        </>
      )}
    </div>
  )
}
