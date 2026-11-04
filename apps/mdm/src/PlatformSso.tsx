import { Alert, Button, Card } from 'antd'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { labels, ReadState, usePageRead } from './AdminUi'
import { useAdministration } from './useAdministration'
export function PlatformSso({
  runtime,
  locale,
  device,
}: {
  runtime: Runtime
  locale: Locale
  device: string
}) {
  const l = labels(locale),
    { deviceAccess, binding } = useAdministration(runtime),
    read = usePageRead(`${binding}/platform-sso/${device}`, () => deviceAccess.platformSso(device))
  return (
    <Card title={l('Platform SSO 管理配置', 'Platform SSO management configuration')}>
      <Button onClick={read.reload}>
        {l('读取当前 Platform SSO 配置', 'Read current Platform SSO configuration')}
      </Button>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      {read.value && (
        <>
          <dl className="device-facts">
            <div>
              <dt>Team / Extension</dt>
              <dd>
                {read.value.teamId} / {read.value.extensionId}
              </dd>
            </div>
            <div>
              <dt>{l('应用 / 版本', 'Application / version')}</dt>
              <dd>
                {read.value.applicationId} / {read.value.applicationVersion}
              </dd>
            </div>
            <div>
              <dt>Client / Issuer</dt>
              <dd>
                {read.value.clientId} / {read.value.issuer}
              </dd>
            </div>
            <div>
              <dt>Profile</dt>
              <dd>
                {read.value.profileId} / {read.value.profileUuid}
              </dd>
            </div>
            <div>
              <dt>{l('注册信任 / 硬件证明要求', 'Registration trust / hardware attestation')}</dt>
              <dd>
                {read.value.registrationTrust} /{' '}
                {read.value.hardwareAttested ? l('是', 'Yes') : l('否', 'No')}
              </dd>
            </div>
          </dl>
          <ol>
            {read.value.deploymentOrder.map((step, index) => (
              <li key={`${index}/${step}`}>{step}</li>
            ))}
          </ol>
        </>
      )}
      <Alert
        type="info"
        showIcon
        title={l(
          '此入口显示已有正式配置；配置可读不证明设备已注册或登录就绪。',
          'This entry reads the formal configuration. A readable configuration does not prove registration or login readiness.',
        )}
      />
    </Card>
  )
}
