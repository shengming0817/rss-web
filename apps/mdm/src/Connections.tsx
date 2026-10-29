import { Alert, Button, Space } from 'antd'
import { Link } from 'react-router-dom'
import { SecretTabs } from './SecretTabs'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Heading, labels, ReadState, useRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { Status } from './DevicePresentation'
import { ProviderConnections } from './ProviderConnections'
import { AppleMaterials } from './AppleMaterials'
import { AgentConnections } from './AgentConnections'
function Evidence({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { connections, binding } = useAdministration(runtime),
    catalog = useRead(`${binding}/connection-catalog`, connections.evidence.catalog),
    loaded = useRead(`${binding}/connection-loaded`, connections.evidence.loaded)
  return (
    <>
      <Alert
        type="info"
        title={l(
          '此处只读取连接材料的配置目录和通道加载观察。没有观察不等于未配置，配置已登记也不等于宿主加载。',
          'This view reads the connection catalog and channel loading observations. No observation does not mean unconfigured, and recorded configuration does not establish loading.',
        )}
      />
      <Button
        onClick={() => {
          catalog.reload()
          loaded.reload()
        }}
      >
        {l('读取当前连接运行观察', 'Read connection runtime observations')}
      </Button>
      <ReadState busy={catalog.busy} error={catalog.error} locale={locale} />
      {catalog.value && (
        <DataTable
          locale={locale}
          dataSource={catalog.value}
          rowKey="id"
          columns={[
            { title: l('连接项目', 'Connection entry'), dataIndex: 'id' },
            {
              title: l('目录状态', 'Catalog state'),
              dataIndex: 'status',
              render: (value) => <Status value={String(value)} locale={locale} />,
            },
            { title: l('已登记版本', 'Recorded revision'), dataIndex: 'revision' },
            { title: l('期望版本', 'Desired revision'), dataIndex: 'desiredRevision' },
            { title: l('已应用版本', 'Applied revision'), dataIndex: 'appliedRevision' },
            { title: l('原因', 'Reason'), dataIndex: 'reason' },
          ]}
        />
      )}
      <ReadState busy={loaded.busy} error={loaded.error} locale={locale} />
      {loaded.value && (
        <DataTable
          locale={locale}
          dataSource={loaded.value}
          rowKey="name"
          columns={[
            { title: l('通道', 'Channel'), dataIndex: 'name' },
            {
              title: l('挂载', 'Mounted'),
              dataIndex: 'mounted',
              render: (value) => (value ? l('是', 'Yes') : l('否', 'No')),
            },
            {
              title: l('运行状态', 'Runtime state'),
              dataIndex: 'state',
              render: (value) => <Status value={String(value)} locale={locale} />,
            },
            {
              title: l('已加载材料版本', 'Loaded material revisions'),
              render: (_, row) =>
                Object.entries(row.loadedMaterials).map(([name, revision]) => (
                  <div key={name}>
                    {name} · {revision}
                  </div>
                )),
            },
            { title: l('原因', 'Reasons'), render: (_, row) => row.reasons.join(', ') },
          ]}
        />
      )}
    </>
  )
}
export function Connections({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { authorization, binding } = useAdministration(runtime),
    permissions = useRead(`${binding}/connection-presentation`, authorization.effective),
    has = (permission: string) =>
      permissions.value?.grants.some(
        (grant) => grant.scope.kind === 'tenant' && grant.operation === permission,
      ) ?? false,
    storageRead = has('storage_configuration_read'),
    storageWrite = has('storage_configuration_write'),
    registrationRead = has('registration_configuration_read'),
    registrationWrite = has('registration_configuration_write')
  const items = [
    {
      key: 'storage',
      label: l('存储', 'Storage'),
      children: (
        <ProviderConnections
          runtime={runtime}
          locale={locale}
          kind="storage"
          canWrite={storageWrite}
        />
      ),
    },
    {
      key: 'mail',
      label: l('邮件', 'Mail'),
      children: (
        <ProviderConnections
          runtime={runtime}
          locale={locale}
          kind="mail"
          canWrite={registrationWrite}
        />
      ),
    },
    {
      key: 'wns',
      label: l('Windows 推送', 'Windows push'),
      children: (
        <ProviderConnections
          runtime={runtime}
          locale={locale}
          kind="wns"
          canWrite={registrationWrite}
        />
      ),
    },
    {
      key: 'apple',
      label: l('Apple 材料', 'Apple materials'),
      children: (
        <SecretTabs
          items={(['apns', 'profile', 'managed_account'] as const).map((purpose) => ({
            key: purpose,
            label:
              purpose === 'apns'
                ? 'APNs'
                : purpose === 'profile'
                  ? l('配置签名', 'Profile signing')
                  : l('受管账户', 'Managed accounts'),
            children: (
              <AppleMaterials
                runtime={runtime}
                locale={locale}
                purpose={purpose}
                canWrite={registrationWrite}
              />
            ),
          }))}
        />
      ),
    },
    {
      key: 'agent',
      label: l('Agent 连接', 'Agent connections'),
      children: <AgentConnections runtime={runtime} locale={locale} canWrite={registrationWrite} />,
    },
    {
      key: 'observations',
      label: l('加载与启用观察', 'Loading and enablement observations'),
      children: <Evidence runtime={runtime} locale={locale} />,
    },
  ]
  return (
    <>
      <Heading
        title={l('连接配置', 'Connections')}
        hint={l(
          '按模块管理材料、资格、选定版本和独立应用观察。',
          'Manage module-specific materials, qualification, selected revisions and separate application observations.',
        )}
        actions={
          <Link className="button-link" to="/enroll">
            {l('注册通道与组织接入', 'Enrollment channels and organizations')}
          </Link>
        }
      />
      <Space wrap>
        <Button onClick={permissions.reload}>
          {l('重新读取当前入口权限', 'Read current entry permissions')}
        </Button>
        <Link to="/security">{l('安全与重认证', 'Security and reauthentication')}</Link>
      </Space>
      <ReadState busy={permissions.busy} error={permissions.error} locale={locale} />
      <SecretTabs
        items={items}
        uiLocale={locale}
        authorizedKeys={[
          ...(storageRead || storageWrite ? ['storage'] : []),
          ...(registrationRead || registrationWrite ? ['mail', 'wns', 'apple', 'agent'] : []),
          ...(storageRead || registrationRead ? ['observations'] : []),
        ]}
      />
      {!storageRead &&
        !storageWrite &&
        !registrationRead &&
        !registrationWrite &&
        !permissions.busy &&
        !permissions.error && (
          <Alert
            type="info"
            title={l(
              '当前账户没有连接配置入口，请联系管理员。',
              'This account has no connection configuration entry. Contact an administrator.',
            )}
          />
        )}
    </>
  )
}
