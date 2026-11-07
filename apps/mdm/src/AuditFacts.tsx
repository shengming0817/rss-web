import { Alert, Descriptions, Space } from 'antd'
import { Link, useLocation } from 'react-router-dom'
import type { ActivityLinks, AuditFact, ManagementActivity } from '@rss/mdm-audit'
import type { Locale } from './i18n'
import { labels } from './AdminUi'
import { Status, timestamp } from './DevicePresentation'
import { executionPath } from './Executions'
import { eventBatchPath, retirementPath } from './execution-context'
import { auditHref, type AuditContext } from './audit-context'

function Coordinates({ links, locale }: { links: ActivityLinks; locale: Locale }) {
  const l = labels(locale)
  return (
    <details>
      <summary>{l('原业务坐标', 'Original owner coordinates')}</summary>
      <Descriptions column={1} size="small">
        {Object.entries(links)
          .filter(([key, value]) => !['operations', 'steps'].includes(key) && value !== null)
          .map(([key, value]) => (
            <Descriptions.Item label={key} key={key}>
              <code>{String(value)}</code>
            </Descriptions.Item>
          ))}
        {links.steps.length > 0 && (
          <Descriptions.Item
            label={l(
              '步骤（由任务、attempt 与版本限定）',
              'Steps (qualified by task, attempt and version)',
            )}
          >
            {links.steps.join(', ')}
          </Descriptions.Item>
        )}
        {links.operations.map((operation) => (
          <Descriptions.Item key={`${operation.kind}/${operation.id}`} label={operation.kind}>
            <code>{operation.id}</code>
          </Descriptions.Item>
        ))}
      </Descriptions>
      <p className="subtitle">
        {l(
          '配置、执行和恢复由原业务模块管理；此处只读取已有事实，不创建任务或推测缺失关联。',
          'Configuration, execution and recovery belong to their original modules. This view reads existing facts without creating tasks or inferring missing links.',
        )}
      </p>
    </details>
  )
}
export function AuditFactView({
  fact,
  locale,
  context,
}: {
  fact: AuditFact
  locale: Locale
  context?: AuditContext
}) {
  const l = labels(locale),
    window = { from: context?.from, until: context?.until, limit: context?.limit },
    timelineDevice =
      fact.deviceId ?? (fact.target.type === 'device' ? fact.target.id : context?.device)
  return (
    <>
      <Descriptions column={1} size="small">
        <Descriptions.Item label={l('行为与来源', 'Action and source')}>
          {fact.action} · {fact.source}
        </Descriptions.Item>
        <Descriptions.Item label={l('主体', 'Actor')}>
          {fact.actorKind} · {fact.actor}
        </Descriptions.Item>
        <Descriptions.Item label={l('资源目标', 'Resource target')}>
          {fact.target.type} · {fact.target.id}
        </Descriptions.Item>
        <Descriptions.Item label={l('服务端记录时间', 'Server recording time')}>
          {timestamp(locale, fact.recordedAt)}
        </Descriptions.Item>
        <Descriptions.Item label={l('生产者观察时间', 'Producer observation time')}>
          {timestamp(locale, fact.observedAt)}
        </Descriptions.Item>
        <Descriptions.Item label={l('审计事务结果', 'Audit transaction outcome')}>
          <Status value={fact.auditOutcome} locale={locale} />
        </Descriptions.Item>
        <Descriptions.Item label={l('请求写入事实', 'Request write fact')}>
          {fact.requestWriteOutcome ?? l('没有事实', 'Unavailable')}
        </Descriptions.Item>
        <Descriptions.Item label={l('执行事实', 'Execution fact')}>
          {fact.executionState ?? l('没有事实', 'Unavailable')}
        </Descriptions.Item>
        <Descriptions.Item label={l('效果证据', 'Effect evidence')}>
          {fact.effect}
        </Descriptions.Item>
      </Descriptions>
      <Space wrap>
        {timelineDevice && (
          <Link to={auditHref({ ...window, view: 'timeline', device: timelineDevice })}>
            {l('查看设备时间线', 'Device timeline')}
          </Link>
        )}
        {fact.operationId && (
          <Link to={auditHref({ ...window, operationId: fact.operationId })}>
            {l('定位此原操作的审计', 'Audit for this original operation')}
          </Link>
        )}
        <Link
          to={auditHref({
            ...window,
            device: context?.device,
            targetType: fact.target.type,
            targetId: fact.target.id,
          })}
        >
          {l('查看此资源审计', 'Audit for this resource')}
        </Link>
      </Space>
      <details>
        <summary>{l('精确事实标识', 'Exact fact identifiers')}</summary>
        <Descriptions column={1} size="small">
          <Descriptions.Item label={l('事件', 'Event')}>{fact.eventId}</Descriptions.Item>
          <Descriptions.Item label={l('记录位置与阶段', 'Position and phase')}>
            {fact.position} · {fact.phase}
          </Descriptions.Item>
          {(
            [
              'operationId',
              'requestId',
              'registrationId',
              'registrationRequestId',
              'instanceId',
            ] as const
          ).map(
            (key) =>
              fact[key] !== null && (
                <Descriptions.Item key={key} label={key}>
                  {fact[key]}
                </Descriptions.Item>
              ),
          )}
          <Descriptions.Item label={l('明确关联的操作', 'Explicit related operations')}>
            <Space orientation="vertical">
              {fact.relatedOperationIds.map((id) => (
                <Link key={id} to={auditHref({ ...window, operationId: id })}>
                  {id}
                </Link>
              ))}
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </details>
      <Alert
        type="info"
        title={l(
          '这是安全审计投影，未执行账本密码学验证；审计事务成功不代表设备效果已验证。',
          'This is a safe audit projection, without cryptographic ledger verification. A successful audit transaction does not verify device effects.',
        )}
      />
    </>
  )
}
export function ActivityFactView({
  fact,
  device,
  locale,
  context,
}: {
  fact: ManagementActivity
  device: string
  locale: Locale
  context?: AuditContext
}) {
  const l = labels(locale),
    location = useLocation(),
    source = location.pathname + location.search,
    targetDevice = fact.target?.device ?? device,
    window = { from: context?.from, until: context?.until, limit: context?.limit },
    dimensions = [
      [l('投递证据', 'Delivery evidence'), fact.delivery],
      [l('执行事实', 'Execution fact'), fact.execution],
      [l('效果证据', 'Effect evidence'), fact.effect],
      [l('上报回执', 'Reporting receipt'), fact.reporting],
      [l('业务决定', 'Business decision'), fact.decision],
      [l('审计事务结果', 'Audit transaction outcome'), fact.auditOutcome],
    ] as const
  return (
    <>
      <Descriptions column={1} size="small">
        <Descriptions.Item label={l('活动与阶段', 'Activity and phase')}>
          {fact.kind} · {fact.phase}
        </Descriptions.Item>
        <Descriptions.Item label={l('来源与发起类别', 'Source and origin')}>
          {fact.source} · {fact.origin}
        </Descriptions.Item>
        <Descriptions.Item label={l('服务端记录时间', 'Server recording time')}>
          {timestamp(locale, fact.recordedAt)}
        </Descriptions.Item>
        <Descriptions.Item label={l('生产者观察时间', 'Producer observation time')}>
          {timestamp(locale, fact.observedAt)}
        </Descriptions.Item>
        <Descriptions.Item
          label={l('原目标通道与注册代次', 'Original channel and registration generation')}
        >
          {fact.target
            ? `${fact.target.device} · ${fact.target.registration} / ${fact.target.generation}`
            : l('父级事实，无设备目标', 'Parent fact without a device target')}
        </Descriptions.Item>
        {dimensions.map(([name, value]) => (
          <Descriptions.Item label={name} key={name}>
            {value === null ? (
              l('没有事实', 'Unavailable')
            ) : (
              <Status value={value} locale={locale} />
            )}
          </Descriptions.Item>
        ))}
      </Descriptions>
      <Space wrap>
        <Link to={auditHref({ ...window, view: 'timeline', device })}>
          {l('此设备时间线', 'This device timeline')}
        </Link>
        {fact.links.policy && (
          <Link to={auditHref({ ...window, targetType: 'policy', targetId: fact.links.policy })}>
            {l('Policy 审计', 'Policy audit')}
          </Link>
        )}
        {fact.links.operation && (
          <Link to={auditHref({ ...window, operationId: fact.links.operation })}>
            {l('原生操作审计', 'Native operation audit')}
          </Link>
        )}
        {fact.links.policy && (
          <Link
            to={`/policies?${new URLSearchParams({ policy: fact.links.policy, tab: 'definition', returnTo: source })}`}
          >
            {l('查看所属策略', 'View owning policy')}
          </Link>
        )}
        {fact.links.batch && (
          <Link
            to={eventBatchPath(
              targetDevice,
              fact.links.batch,
              fact.links.member ?? undefined,
              source,
            )}
          >
            {l('查看原事件批次', 'View original event batch')}
          </Link>
        )}
        {fact.links.task && (
          <Link
            to={executionPath(
              'action_run',
              fact.links.task,
              fact.links.policy ?? undefined,
              source,
            )}
          >
            {l('查看原任务执行', 'View original task run')}
          </Link>
        )}
        {fact.kind === 'configuration' && fact.links.operation && (
          <Link to={executionPath('command', fact.links.operation, undefined, source)}>
            {l('查看原配置命令', 'View original configuration command')}
          </Link>
        )}
        {fact.links.retirement && (
          <Link to={retirementPath(targetDevice, fact.links.retirement, source)}>
            {l('设备退管入口', 'Device retirement')}
          </Link>
        )}
        {fact.links.operations.map((reference) => (
          <Link
            key={`${reference.kind}/${reference.id}`}
            to={
              reference.kind === 'retirement'
                ? retirementPath(targetDevice, reference.id, source)
                : executionPath(
                    reference.kind === 'run' ? 'action_run' : 'command',
                    reference.id,
                    reference.kind === 'run' ? (fact.links.policy ?? undefined) : undefined,
                    source,
                  )
            }
          >
            {l('关联操作', 'Related operation')} · {reference.id}
          </Link>
        ))}
      </Space>
      <Coordinates links={fact.links} locale={locale} />
    </>
  )
}
