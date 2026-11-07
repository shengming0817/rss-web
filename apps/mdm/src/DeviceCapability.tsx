import type { EndpointDetail } from '@rss/mdm-devices'
import type { Locale } from './i18n'
import { labels } from './AdminUi'
import { Status } from './DevicePresentation'

export function CapabilityReason({ reason, locale }: { reason: string | null; locale: Locale }) {
  const l = labels(locale)
  switch (reason) {
    case null:
      return null
    case 'product_not_configured':
      return l('产品通道或所需配置缺失', 'Product channel or required configuration is missing')
    case 'not_registered':
      return l('没有当前主 MDM 注册', 'No current primary MDM registration')
    case 'capability_unknown':
      return l('当前设备证据不足', 'Current device evidence is insufficient')
    case 'capability_not_supported':
      return l('设备前提明确不满足', 'Device prerequisites are known to be unmet')
    case 'permission_denied':
      return l('当前账户没有此动作权限', 'The current account lacks permission for this action')
    default:
      return reason
  }
}
type Capability = EndpointDetail['capabilities'][number]
export function CapabilityState({
  value,
  locale,
}: {
  value: Capability['productSupport']
  locale: Locale
}) {
  return (
    <>
      <Status value={value.state} locale={locale} />
      {value.reason && (
        <>
          {' '}
          · <CapabilityReason reason={value.reason} locale={locale} />
        </>
      )}
    </>
  )
}

export function CapabilityPermission({
  value,
  locale,
}: {
  value: Capability['permission']
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <>
      {value.allowed ? l('允许', 'Allowed') : l('拒绝', 'Denied')}
      {value.reason && (
        <>
          {' '}
          · <CapabilityReason reason={value.reason} locale={locale} />
        </>
      )}
    </>
  )
}
