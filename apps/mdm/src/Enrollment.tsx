import { Button, Space } from 'antd'
import { Link } from 'react-router-dom'
import { SecretTabs } from './SecretTabs'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Heading, labels, ReadState, useRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { NativeEnrollment } from './NativeEnrollment'
import { AgentConfigurations } from './AgentConfigurations'
import { RegistrationAdministration } from './RegistrationAdministration'
import { AppleEnrollment } from './AppleEnrollment'
import { EntraConfiguration } from './EntraConfiguration'
/** Permission projection controls presentation only. Every action is authorized by the backend. */
export function Enrollment({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { authorization, binding } = useAdministration(runtime),
    permissions = useRead(`${binding}/enrollment-presentation`, authorization.effective),
    has = (permission: string) =>
      permissions.value?.grants.some(
        (grant) => grant.scope.kind === 'tenant' && grant.operation === permission,
      ) ?? false,
    registrationRead = has('registration_configuration_read'),
    registrationWrite = has('registration_configuration_write'),
    agentRead = has('agent_enrollment_read'),
    agentWrite = has('agent_enrollment_write')
  return (
    <>
      <Heading
        title={l('设备注册', 'Device enrollment')}
        hint={l(
          '原生注册、公开安装包与管理员安装配置各自独立。',
          'Native enrollment, public installers and administrator enrollment files have separate flows.',
        )}
        actions={
          <Link className="button-link" to="/downloads/agent">
            {l('公开 Agent 安装包', 'Public Agent installers')}
          </Link>
        }
      />
      <Space wrap>
        <Button onClick={permissions.reload}>
          {l('重新读取当前入口权限', 'Read current entry permissions')}
        </Button>
        <Link to="/connections">{l('连接配置', 'Connections')}</Link>
      </Space>
      <ReadState busy={permissions.busy} error={permissions.error} locale={locale} />
      <SecretTabs
        uiLocale={locale}
        authorizedKeys={[
          'native',
          ...(agentRead || agentWrite ? ['configurations'] : []),
          ...(registrationRead || registrationWrite ? ['admission', 'apple', 'entra'] : []),
        ]}
        items={[
          {
            key: 'native',
            label: l('注册我的设备', 'Enroll my device'),
            children: <NativeEnrollment runtime={runtime} locale={locale} />,
          },
          {
            key: 'configurations',
            label: l('管理员安装配置', 'Administrator enrollment JSON'),
            children: (
              <AgentConfigurations runtime={runtime} locale={locale} canWrite={agentWrite} />
            ),
          },
          {
            key: 'admission',
            label: l('通道与配额', 'Admission and quotas'),
            children: (
              <RegistrationAdministration
                runtime={runtime}
                locale={locale}
                canWrite={registrationWrite}
              />
            ),
          },
          {
            key: 'apple',
            label: l('Apple 组织接入', 'Apple organizations'),
            children: (
              <AppleEnrollment runtime={runtime} locale={locale} canWrite={registrationWrite} />
            ),
          },
          {
            key: 'entra',
            label: 'Windows Entra',
            children: (
              <EntraConfiguration runtime={runtime} locale={locale} canWrite={registrationWrite} />
            ),
          },
        ]}
      />
    </>
  )
}
