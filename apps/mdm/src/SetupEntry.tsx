import { Alert, Button, Space } from 'antd'
import { Link, Navigate } from 'react-router-dom'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { labels, ReadState, usePageRead } from './AdminUi'
import { useAdministration } from './useAdministration'
export function SetupEntry({
  runtime,
  locale,
  children,
}: {
  runtime: Runtime
  locale: Locale
  children: React.ReactNode
}) {
  const l = labels(locale),
    { tenantSetup, binding, authorization } = useAdministration(runtime),
    permissions = usePageRead(`${binding}/entry-permissions`, authorization.effective),
    allowed =
      !permissions.busy &&
      !permissions.error &&
      permissions.value?.grants.some(
        (g) => g.operation === 'registration_configuration_write' && g.scope.kind === 'tenant',
      ),
    progress = usePageRead(`${binding}/entry/${!!allowed}`, async () =>
      allowed && tenantSetup ? tenantSetup.read() : null,
    )
  if (runtime.management) return children
  if (permissions.busy || (allowed && progress.busy))
    return <ReadState busy error={null} locale={locale} />
  if (allowed && progress.value && !progress.value.saved.intent.completionRequested)
    return <Navigate to="/setup" replace />
  return (
    <>
      {(permissions.error || (allowed && progress.error)) && (
        <Alert
          type="warning"
          title={l('无法确认初始化进度。', 'Setup progress could not be confirmed.')}
          action={
            <Space wrap>
              <Button
                onClick={() => {
                  permissions.reload()
                  progress.reload()
                }}
              >
                {l('重新读取', 'Read again')}
              </Button>
              <Link to="/setup">{l('打开初始化', 'Open setup')}</Link>
            </Space>
          }
        />
      )}
      <Space wrap>
        <Link to={runtime.management ? '/platform/settings' : '/settings'}>
          {l('设置', 'Settings')}
        </Link>
      </Space>
      {children}
    </>
  )
}
