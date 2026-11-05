import { TelemetryDenied } from './telemetry-read'
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Form, Input, Space } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Heading, labels, ReadState, usePageRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { SecretTabs, useSecretVisibility } from './SecretTabs'
import { TelemetryQuery } from './TelemetryQuery'
import { TelemetryConfigurations } from './TelemetryConfigurations'
import { devicePermission } from './DeviceSecurity'

export function TelemetryWorkspace({
  runtime,
  locale,
  device: fixedDevice,
}: {
  runtime: Runtime
  locale: Locale
  device?: string
}) {
  const l = labels(locale),
    { authorization, binding } = useAdministration(runtime),
    permissions = usePageRead(`${binding}/telemetry-permissions`, authorization.effective),
    [params, setParams] = useSearchParams(),
    [draft, setDraft] = useState(params.get('device') ?? ''),
    device = fixedDevice ?? params.get('device') ?? '',
    [denied, setDenied] = useState(''),
    deny = useCallback(() => setDenied(`${binding}/${device}`), [binding, device]),
    panelVisible = useSecretVisibility(),
    [documentVisible, setDocumentVisible] = useState(document.visibilityState !== 'hidden')
  useEffect(() => {
    const update = () => setDocumentVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  const grants = permissions.value?.grants ?? [],
    authority =
      permissions.busy || permissions.error || denied === `${binding}/${device}`
        ? ''
        : JSON.stringify(grants),
    has = (operation: string) =>
      !!authority && grants.some((g) => g.operation === operation && g.scope.kind === 'tenant'),
    canRead = !!authority && devicePermission(grants, device, 'inventory_read'),
    canConfiguration = canRead && has('policy_read') && has('resource_read')
  return (
    <div className="admin-stack telemetry-page">
      {!fixedDevice && (
        <Heading
          title={l('遥测与采集', 'Telemetry and collection')}
          hint={l(
            '查看已上报的观察与采集方案。刷新只读取数据，不触发设备采集。',
            'Inspect reported observations and collection plans. Refresh reads data; it does not trigger device collection.',
          )}
          actions={<Link to="/resources">{l('管理采集方案', 'Manage collection plans')}</Link>}
        />
      )}
      <Space wrap>
        <Button
          onClick={() => {
            setDenied('')
            permissions.reload()
          }}
        >
          {l('刷新权限', 'Refresh permissions')}
        </Button>
        {device && <code>{device}</code>}
      </Space>
      <ReadState locale={locale} busy={permissions.busy} error={permissions.error} />
      {!fixedDevice && (
        <Card size="small">
          <Form layout="inline" onFinish={() => setParams({ device: draft })}>
            <Form.Item label={l('终端标识', 'Endpoint ID')}>
              <Input
                aria-label={l('终端标识', 'Endpoint ID')}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoComplete="off"
              />
            </Form.Item>
            <Button htmlType="submit" disabled={!draft}>
              {l('打开终端遥测', 'Open endpoint telemetry')}
            </Button>
          </Form>
        </Card>
      )}
      {device && permissions.value && !canRead && !canConfiguration && (
        <Alert
          type="info"
          title={l(
            '当前账户没有此终端的遥测读取权限。',
            'Your account cannot read telemetry for this endpoint.',
          )}
        />
      )}
      {denied === `${binding}/${device}` && (
        <Alert
          type="warning"
          title={l(
            '服务端已拒绝读取，已清除遥测结果。请重新读取权限。',
            'The server denied access. Telemetry results were cleared. Read permissions again.',
          )}
        />
      )}
      {device && authority && panelVisible && documentVisible && (
        <TelemetryDenied.Provider value={deny}>
          <SecretTabs
            key={`${binding}/${device}/${authority}`}
            uiLocale={locale}
            authorizedKeys={[
              ...(canRead ? ['query'] : []),
              ...(canConfiguration ? ['configurations'] : []),
            ]}
            items={[
              ...(canRead
                ? [
                    {
                      key: 'query',
                      label: l('数据查询', 'Data query'),
                      children: (
                        <TelemetryQuery
                          runtime={runtime}
                          locale={locale}
                          device={device}
                          canFields={canRead}
                        />
                      ),
                    },
                  ]
                : []),
              ...(canConfiguration
                ? [
                    {
                      key: 'configurations',
                      label: l('配置发现与预览', 'Configuration discovery and preview'),
                      children: (
                        <TelemetryConfigurations
                          runtime={runtime}
                          locale={locale}
                          device={device}
                          canResource={has('resource_read')}
                          canPolicy={has('policy_read')}
                        />
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </TelemetryDenied.Provider>
      )}
    </div>
  )
}
export function Telemetry(props: { runtime: Runtime; locale: Locale }) {
  return <TelemetryWorkspace {...props} />
}
