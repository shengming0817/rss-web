import type { Grant } from '@rss/mdm-authorization'
import type { ViewEndpoint } from '@rss/mdm-devices'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { labels } from './AdminUi'
import { SecretPanel, SecretTabs } from './SecretTabs'
import { RecoveryCredentials } from './RecoveryCredentials'
import { DevicePkiObservation, DevicePkiRecovery } from './DevicePkiRecovery'
/** Current navigation hints only. Every endpoint still enforces transactional resource authorization. */
export function devicePermission(
  grants: readonly Grant[],
  device: string,
  operation: string,
): boolean {
  return grants.some(
    (grant) =>
      grant.operation === operation &&
      (grant.scope.kind === 'all_devices' ||
        (grant.scope.kind === 'device' && grant.scope.id === device)),
  )
}
export function hasDeviceSecurity(grants: readonly Grant[], device: string): boolean {
  return [
    'inventory_read',
    'credentials',
    'security_operate',
    'account_write',
    'device_control',
    'operation_read',
  ].some((operation) => devicePermission(grants, device, operation))
}
export function DeviceSecurity({
  runtime,
  endpoint,
  locale,
  grants,
}: {
  runtime: Runtime
  endpoint: ViewEndpoint
  locale: Locale
  grants: readonly Grant[]
}) {
  const l = labels(locale),
    has = (operation: string) => devicePermission(grants, endpoint.id, operation),
    canRead = has('inventory_read'),
    canRecover = has('credentials')
  return (
    <SecretTabs
      uiLocale={locale}
      authorizedKeys={[
        ...(hasDeviceSecurity(grants, endpoint.id) ? ['credentials'] : []),
        ...(canRead || canRecover ? ['pki'] : []),
      ]}
      items={[
        {
          key: 'credentials',
          label: l('恢复凭据', 'Recovery credentials'),
          children: (
            <RecoveryCredentials runtime={runtime} endpoint={endpoint} locale={locale} has={has} />
          ),
        },
        {
          key: 'pki',
          label: l('设备 PKI 恢复与观察', 'Device PKI recovery and observations'),
          children: (
            <>
              <SecretPanel active={canRead}>
                <fieldset className="permission-panel" hidden={!canRead} disabled={!canRead}>
                  <DevicePkiObservation
                    runtime={runtime}
                    locale={locale}
                    endpoint={endpoint}
                    canRead={canRead}
                  />
                </fieldset>
              </SecretPanel>
              <SecretPanel active={canRecover}>
                <fieldset className="permission-panel" hidden={!canRecover} disabled={!canRecover}>
                  <DevicePkiRecovery
                    runtime={runtime}
                    locale={locale}
                    endpoint={endpoint}
                    canRecover={canRecover}
                  />
                </fieldset>
              </SecretPanel>
            </>
          ),
        },
      ]}
    />
  )
}
