import { useSyncExternalStore } from 'react'
import { Alert, Button } from 'antd'
import { useSearchParams } from 'react-router-dom'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Heading, labels, ReadState, useRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { SecretTabs } from './SecretTabs'
import { SelectionGuard, useSelectionGuard } from './SelectionGuard'
import { WebhookSubscriptions } from './WebhookSubscriptions'
import { WebhookDeliveries } from './WebhookDeliveries'
import { WebhookMaterials } from './WebhookMaterials'
import { WebhookHealth } from './WebhookHealth'

export function Webhooks({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    guard = useSelectionGuard(),
    session = useSyncExternalStore(runtime.owner.subscribe, runtime.owner.getSnapshot),
    [params, setParams] = useSearchParams(),
    { webhooks, groups, authorization, binding } = useAdministration(runtime),
    permissions = useRead(`${binding}/webhook-presentation`, authorization.effective),
    grants = permissions.value?.grants ?? [],
    has = (operation: string) =>
      !permissions.busy &&
      !permissions.error &&
      grants.some((grant) => grant.operation === operation && grant.scope.kind === 'tenant'),
    canRead = has('webhook_read'),
    canWrite = has('webhook_write'),
    canReplay = has('webhook_replay'),
    tab = params.get('tab') ?? 'subscriptions',
    valid = ['subscriptions', 'deliveries', 'materials', 'health'].includes(tab),
    authority = permissions.busy || permissions.error ? 'unavailable' : JSON.stringify(grants)
  return (
    <section className="webhooks-page">
      <Heading
        title={l('Webhook 集成', 'Webhook integrations')}
        hint={l(
          '管理订阅、排队事件与投递事实；配置受理、外部接收和下游业务分别确认。',
          'Manage subscriptions, queued events and delivery facts. Configuration admission, external acceptance and downstream completion are separate.',
        )}
        actions={
          <Button onClick={permissions.reload}>
            {l('读取当前 Webhook 权限', 'Read current Webhook permissions')}
          </Button>
        }
      />
      <ReadState busy={permissions.busy} error={permissions.error} locale={locale} />
      {!valid && (
        <Alert
          type="error"
          title={l(
            '当前 Webhook 导航定位无效。',
            'The current Webhook navigation locator is invalid.',
          )}
        />
      )}
      <SelectionGuard.Provider value={guard.register}>
        <SecretTabs
          uiLocale={locale}
          activeKey={tab}
          onChange={(tab) => {
            const next = new URLSearchParams(params)
            next.set('tab', tab)
            setParams(next)
          }}
          authorizedKeys={
            valid
              ? [
                  ...(canRead || canWrite ? ['subscriptions'] : []),
                  ...(canRead || canReplay ? ['deliveries'] : []),
                  ...(canRead || canWrite ? ['materials'] : []),
                  ...(canRead ? ['health'] : []),
                ]
              : []
          }
          items={[
            {
              key: 'subscriptions',
              label: l('订阅', 'Subscriptions'),
              children: (
                <WebhookSubscriptions
                  webhooks={webhooks}
                  groups={groups}
                  binding={binding}
                  authority={authority}
                  locale={locale}
                  canRead={canRead}
                  canWrite={canWrite}
                  blocked={guard.locked}
                />
              ),
            },
            {
              key: 'deliveries',
              label: l('投递记录', 'Deliveries'),
              children: (
                <WebhookDeliveries
                  webhooks={webhooks}
                  binding={binding}
                  authority={authority}
                  locale={locale}
                  canRead={canRead}
                  canReplay={canReplay}
                  blocked={guard.locked}
                />
              ),
            },
            {
              key: 'materials',
              label: l('签名材料', 'Signing material'),
              children: (
                <WebhookMaterials
                  webhooks={webhooks}
                  binding={binding}
                  authority={authority}
                  locale={locale}
                  canRead={canRead}
                  canWrite={canWrite}
                  materialRecovery={runtime.webhookMaterialRecovery}
                  canReauthenticate={!!session.identity?.hasLocalPassword}
                  blocked={guard.locked}
                />
              ),
            },
            {
              key: 'health',
              label: l('投递健康', 'Delivery health'),
              children: (
                <WebhookHealth
                  webhooks={webhooks}
                  binding={binding}
                  authority={authority}
                  locale={locale}
                  canRead={canRead}
                />
              ),
            },
          ]}
        />
      </SelectionGuard.Provider>
      {!permissions.busy && !canRead && !canWrite && !canReplay && (
        <Alert
          type="info"
          title={l(
            '当前没有 Webhook 管理权限。',
            'Webhook administration permission is unavailable.',
          )}
        />
      )}
    </section>
  )
}
