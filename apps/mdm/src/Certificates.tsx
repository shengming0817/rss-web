import { Button } from 'antd'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Heading, labels, ReadState, useRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { SecretTabs } from './SecretTabs'
import { DevicePki } from './DevicePki'
import { CertificateArchive } from './CertificateArchive'
export function Certificates({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { authorization, binding } = useAdministration(runtime),
    permissions = useRead(`${binding}/certificates-presentation`, authorization.effective),
    has = (operation: string) =>
      permissions.value?.grants.some(
        (grant) => grant.operation === operation && grant.scope.kind === 'tenant',
      ) ?? false,
    canManage =
      permissions.value?.grants.some(
        (grant) => grant.operation === 'credentials' && grant.scope.kind === 'all_devices',
      ) ?? false,
    canRead = has('certificate_archive_read'),
    canWrite = has('certificate_archive_write'),
    canUnlock = has('certificate_archive_unlock'),
    canExport = has('certificate_archive_export')
  return (
    <>
      <Heading
        title={l('证书与设备 PKI', 'Certificates and device PKI')}
        hint={l(
          '管理档案材料与设备信任代次，分别核对授权、运行材料和设备事实。',
          'Manage archive material and device trust generations, with separate authorization, loaded material and device facts.',
        )}
        actions={
          <Button onClick={permissions.reload}>
            {l('重新读取证书管理权限', 'Read current certificate permissions')}
          </Button>
        }
      />
      <ReadState busy={permissions.busy} error={permissions.error} locale={locale} />
      <SecretTabs
        uiLocale={locale}
        authorizedKeys={[
          ...(canRead || canWrite || canUnlock || canExport ? ['archive'] : []),
          ...(canManage ? ['pki'] : []),
        ]}
        items={[
          {
            key: 'archive',
            label: l('证书档案', 'Certificate archive'),
            children: (
              <CertificateArchive
                runtime={runtime}
                locale={locale}
                canRead={canRead}
                canWrite={canWrite}
                canUnlock={canUnlock}
                canExport={canExport}
              />
            ),
          },
          {
            key: 'pki',
            label: l('设备 PKI', 'Device PKI'),
            children: <DevicePki runtime={runtime} locale={locale} canManage={canManage} />,
          },
        ]}
      />
    </>
  )
}
