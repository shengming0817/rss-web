import { Descriptions } from 'antd'
import type { EvidenceDocument, ExecutionDetail } from '@rss/mdm-execution'
import type { Locale } from './i18n'
import { labels } from './AdminUi'
import { Status, timestamp } from './DevicePresentation'

function Evidence({ title, value }: { title: string; value: EvidenceDocument | string | null }) {
  return (
    value && (
      <details>
        <summary>{title}</summary>
        <pre className="public-json">{JSON.stringify(value, null, 2)}</pre>
      </details>
    )
  )
}
/** Evidence is loaded only after an explicit read and retains its original owner. */
export function ExecutionEvidence({ detail, locale }: { detail: ExecutionDetail; locale: Locale }) {
  const l = labels(locale)
  return (
    <section aria-label={l('原始结果证据', 'Original result evidence')}>
      <Descriptions className="device-facts" column={1} size="small">
        <Descriptions.Item label={l('事实所属', 'Evidence owner')}>
          <Status locale={locale} value={detail.owner} />
        </Descriptions.Item>
        <Descriptions.Item label={l('投递 / 命令状态', 'Delivery / command state')}>
          <Status locale={locale} value={detail.delivery} />
        </Descriptions.Item>
        {detail.kind === 'command' ? (
          <>
            <Descriptions.Item label={l('动作', 'Action')}>
              {detail.task.name} · {detail.task.kind}
            </Descriptions.Item>
            <Descriptions.Item label={l('原输入版本', 'Original input version')}>
              {detail.inputVersion}
            </Descriptions.Item>
            <Descriptions.Item label={l('效果证据', 'Effect evidence')}>
              <Status locale={locale} value={detail.observation.effect} />
            </Descriptions.Item>
          </>
        ) : (
          <>
            <Descriptions.Item label={l('原执行版本', 'Original execution version')}>
              {detail.versionId ?? l('未提供', 'Not provided')}
            </Descriptions.Item>
            <Descriptions.Item label={l('触发记录', 'Occurrence')}>
              {detail.occurrence}
            </Descriptions.Item>
            <Descriptions.Item label={l('可执行时间', 'Available at')}>
              {timestamp(locale, detail.availableAt)}
            </Descriptions.Item>
            <Descriptions.Item label={l('设备执行', 'Device execution')}>
              {detail.state ? (
                <Status locale={locale} value={detail.state.execution} />
              ) : (
                l('无独立执行回执', 'No separate execution receipt')
              )}
            </Descriptions.Item>
            <Descriptions.Item label={l('效果证据', 'Effect evidence')}>
              {detail.effect ? (
                <Status locale={locale} value={detail.effect} />
              ) : (
                l('未提供独立效果投影', 'No separate effect projection provided')
              )}
            </Descriptions.Item>
            <Descriptions.Item label={l('取消', 'Cancellation')}>
              {detail.state?.cancellation ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label={l('当前尝试', 'Current attempt')}>
              {detail.attempt ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label={l('开始时间', 'Started at')}>
              {timestamp(locale, detail.state?.startedAt)}
            </Descriptions.Item>
            {detail.owner === 'script' && detail.result && (
              <>
                <Descriptions.Item label={l('进程退出码', 'Process exit code')}>
                  {typeof detail.result['exitCode'] === 'number'
                    ? detail.result['exitCode']
                    : l('未知', 'Unknown')}
                </Descriptions.Item>
                <Descriptions.Item label={l('输出质量', 'Output quality')}>
                  {typeof detail.result['quality'] === 'string' ? detail.result['quality'] : '—'}
                </Descriptions.Item>
              </>
            )}
            {detail.owner === 'script' && (
              <Descriptions.Item label={l('脚本资源', 'Script resource')}>
                {detail.resourceId}
              </Descriptions.Item>
            )}
          </>
        )}
        <Descriptions.Item label={l('截止时间', 'Deadline')}>
          {timestamp(locale, detail.deadline)}
        </Descriptions.Item>
      </Descriptions>
      <Evidence
        title={l('执行授权与原因', 'Execution authorization and reason')}
        value={detail.authorization}
      />
      {detail.kind === 'command' ? (
        <>
          <Evidence title={l('派发失败原因', 'Dispatch failure')} value={detail.dispatchFailure} />
          <Evidence
            title={l('设备回执与核实证据', 'Device receipts and verification evidence')}
            value={detail.observation}
          />
          <Evidence title={l('原目标', 'Original target')} value={detail.target} />
        </>
      ) : (
        <>
          <Evidence title={l('原运行结果', 'Original run result')} value={detail.result} />
          {detail.owner === 'collection' && (
            <Evidence
              title={l('报告与投影状态', 'Report and projection state')}
              value={detail.report}
            />
          )}
          {'userAction' in detail && detail.userAction && (
            <p>
              {l('用户动作', 'User action')}: {detail.userAction}
            </p>
          )}
        </>
      )}
    </section>
  )
}
