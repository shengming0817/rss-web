import { Descriptions } from 'antd'
import type { MaterialOperation } from '@rss/mdm-webhooks'
import type { Locale } from './i18n'
import { labels } from './AdminUi'
import { Status, timestamp } from './DevicePresentation'
export function WebhookMaterialFacts({
  value,
  locale,
}: {
  value: MaterialOperation
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <Descriptions column={1} size="small">
      <Descriptions.Item label={l('原材料操作', 'Original material operation')}>
        {value.operationId}
      </Descriptions.Item>
      <Descriptions.Item label={l('签名引用', 'Signing reference')}>
        {value.reference}
      </Descriptions.Item>
      <Descriptions.Item label={l('回执版本', 'Receipt revision')}>
        {value.revision}
      </Descriptions.Item>
      {'configurationSha256' in value ? (
        <>
          <Descriptions.Item label={l('持钥确认', 'Key possession confirmation')}>
            <Status value={value.confirmed ? 'confirmed' : 'unconfirmed'} locale={locale} />
          </Descriptions.Item>
          <Descriptions.Item label={l('材料撤销', 'Material revocation')}>
            {value.revoked ? (
              <Status value="revoked" locale={locale} />
            ) : (
              l('未撤销', 'Not revoked')
            )}
          </Descriptions.Item>
          <Descriptions.Item label={l('接收地址', 'Receiver endpoint')}>
            {value.endpoint ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label={l('网络引用', 'Network reference')}>
            {value.networkReference ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label={l('最近确认尝试', 'Latest confirmation attempt')}>
            {timestamp(locale, value.attemptedAt)}
          </Descriptions.Item>
          <Descriptions.Item label={l('确认时间', 'Confirmation time')}>
            {timestamp(locale, value.confirmedAt)}
          </Descriptions.Item>
          <Descriptions.Item label={l('确认失败原因', 'Confirmation failure reason')}>
            {value.failureReason ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label={l('宿主配置 SHA-256', 'Host configuration SHA-256')}>
            <code>{value.configurationSha256}</code>
          </Descriptions.Item>
          <Descriptions.Item label={l('密钥摘要', 'Key digest')}>
            <code>{value.keyDigest}</code>
          </Descriptions.Item>
        </>
      ) : (
        <>
          <Descriptions.Item label={l('当前签名材料版本', 'Active signing material revision')}>
            {value.activeRevision ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label={l('退役中的旧材料版本', 'Retiring material revision')}>
            {value.retiringRevision ?? '—'}
          </Descriptions.Item>
        </>
      )}
    </Descriptions>
  )
}
