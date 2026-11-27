import { Alert, Button, Descriptions, Space } from 'antd'
import { Link } from 'react-router-dom'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Heading, labels, ReadState, usePageRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { setupDestination, setupName } from './setup-presentation'
import { SetupStatus } from './SetupStatus'
export function Settings({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { settingsCatalog, binding, authorization } = useAdministration(runtime),
    permissions = usePageRead(`${binding}/settings-permissions`, authorization.effective),
    catalog = usePageRead(`${binding}/settings`, settingsCatalog)
  const prefix = runtime.management ? '/platform' : ''
  const has = (operation: string) =>
    !permissions.busy &&
    !permissions.error &&
    (permissions.value?.grants.some(
      (g) => g.operation === operation && g.scope.kind === 'tenant',
    ) ??
      false)
  const canReadTrust =
    !runtime.management &&
    (has('registration_configuration_read') ||
      (!permissions.busy &&
        !permissions.error &&
        permissions.value?.grants.some(
          (grant) =>
            grant.operation === 'inventory_read' &&
            (grant.scope.kind === 'all_devices' || grant.scope.kind === 'device'),
        )))
  function destinationFor(id: string) {
    const destination = setupDestination(id)
    if (destination === '/settings/task-trust' && !canReadTrust) return null
    if (destination === '/downloads/agent' && runtime.management) return null
    return destination
  }
  const links = new Map<string, string>()
  for (const domain of catalog.value?.domains ?? []) {
    const destination = destinationFor(domain.id)
    if (destination && destination !== '/settings/task-trust') {
      const path =
        runtime.management && !destination.startsWith('/platform/')
          ? `${prefix}${destination}`
          : destination
      if (!links.has(path)) links.set(path, setupName(locale, domain.id))
    }
  }
  if (!runtime.management && has('resource_read')) links.set('/resources', l('资源库', 'Resources'))
  if (runtime.management && has('authorization_read'))
    links.set('/platform/authorization', l('授权目录', 'Authorization'))

  return (
    <div className="admin-stack settings-page">
      <Heading
        title={l('设置', 'Settings')}
        hint={l(
          '按当前权限查看配置和所属模块。登记、应用与实际健康分别展示。',
          'Inspect configuration and its owner with current permissions. Recorded, applied and healthy are separate observations.',
        )}
        actions={
          <Button
            onClick={() => {
              catalog.reload()
              permissions.reload()
            }}
          >
            {l('刷新', 'Refresh')}
          </Button>
        }
      />
      <Space wrap>
        {!runtime.management && <Link to="/setup">{l('租户初始化', 'Tenant setup')}</Link>}
        {!runtime.management && (
          <Link to="/diagnostics">{l('运行诊断', 'Runtime diagnostics')}</Link>
        )}
        {canReadTrust && (
          <Link to="/settings/task-trust">{l('任务签名信任', 'Task signing trust')}</Link>
        )}
        <Link to={`${prefix}/security`}>{l('安全与重认证', 'Security and reauthentication')}</Link>
      </Space>
      <ReadState locale={locale} busy={catalog.busy} error={catalog.error} />
      <ReadState locale={locale} busy={permissions.busy} error={permissions.error} />
      {catalog.value && (
        <>
          <div className="group-grid">
            {catalog.value.items.map((item) => {
              const destination = destinationFor(item.id)
              return (
                <section className="panel" key={item.id}>
                  <div className="panel-head">
                    <h2>{setupName(locale, item.id)}</h2>
                    <SetupStatus locale={locale} value={item.status} />
                  </div>
                  <div className="panel-body">
                    <Descriptions
                      column={1}
                      size="small"
                      items={[
                        {
                          key: 'scope',
                          label: l('范围', 'Scope'),
                          children: setupName(locale, item.scope),
                        },
                        { key: 'owner', label: l('所属模块', 'Owner'), children: item.owner },
                        {
                          key: 'custody',
                          label: l('托管方', 'Custody'),
                          children: setupName(locale, item.custody),
                        },
                        {
                          key: 'lifecycle',
                          label: l('生命周期', 'Lifecycle'),
                          children: setupName(locale, item.lifecycle),
                        },
                        {
                          key: 'revision',
                          label: l(
                            '登记 / 期望 / 应用版本',
                            'Recorded / desired / applied revision',
                          ),
                          children: `${item.revision ?? '—'} / ${item.desiredRevision ?? '—'} / ${item.appliedRevision ?? '—'}`,
                        },
                        {
                          key: 'count',
                          label: l('已配置数量', 'Configured count'),
                          children: item.configuredCount ?? '—',
                        },
                      ]}
                    />
                    {item.reason && <p className="subtitle">{setupName(locale, item.reason)}</p>}
                    {item.scope !== 'deployment' && destination && (
                      <Link
                        reloadDocument={destination === '/downloads/agent'}
                        to={
                          runtime.management && !destination.startsWith('/platform/')
                            ? `/platform${destination}`
                            : destination
                        }
                      >
                        {l('打开配置', 'Open configuration')} →
                      </Link>
                    )}
                    {item.scope === 'deployment' && (
                      <p className="subtitle">
                        {l('由部署运维维护。', 'Managed by the deployment operator.')}
                      </p>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
          {!catalog.value.items.length && (
            <Alert
              type="info"
              title={l(
                '当前权限下没有可读配置。',
                'No configuration is readable with current permissions.',
              )}
            />
          )}
          <section className="panel">
            <div className="panel-head">
              <h2>{l('业务与管理入口', 'Domain and administration entries')}</h2>
            </div>
            <div className="panel-body">
              <Space wrap>
                {[...links].map(([path, name]) => (
                  <Link key={path} to={path} reloadDocument={path === '/downloads/agent'}>
                    {name}
                  </Link>
                ))}
                {catalog.value.domains
                  .filter((domain) => !setupDestination(domain.id))
                  .map((domain) => (
                    <span key={domain.id}>{domain.id}</span>
                  ))}
              </Space>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
