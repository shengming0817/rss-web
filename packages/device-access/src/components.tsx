import { Button, Tag } from 'antd'
import type {
  Assignment,
  Binding,
  Computer,
  Material,
  OriginalOperation,
  PasskeyRecord,
} from './model'
const observed = (value: number | null) => (value === null ? '未观察' : `v${value}`)
export function AccountBindingSummary({ binding: b }: { binding: Binding }) {
  return (
    <dl className="da-facts">
      <dt>本地账号</dt>
      <dd>{b.account}</dd>
      <dt>绑定代际</dt>
      <dd>{b.bindingGeneration}</dd>
      <dt>因子代际</dt>
      <dd>{b.factorGeneration}</dd>
      <dt>实际应用</dt>
      <dd>{observed(b.appliedRevision)}</dd>
    </dl>
  )
}
export function AssetAssignmentSummary({ assignment: a }: { assignment: Assignment }) {
  return (
    <dl className="da-facts">
      <dt>资产使用人</dt>
      <dd>{a.assignee?.label ?? '未分配'}</dd>
      <dt>资产所有人</dt>
      <dd>{a.owner?.label ?? '未分配'}</dd>
    </dl>
  )
}
export function DeviceAccessSummary({
  computer,
  bindings,
}: {
  computer: Computer
  bindings: Binding[]
}) {
  return (
    <section aria-label="设备访问摘要">
      <p>{computer.name}：配置、接收、实际应用与账号注册分别观察；平台状态不代表当前应用会话。</p>
      <table>
        <thead>
          <tr>
            <th>账号绑定</th>
            <th>目标</th>
            <th>接收</th>
            <th>实际应用</th>
            <th>服务端关联</th>
          </tr>
        </thead>
        <tbody>
          {bindings.map((b) => (
            <tr key={b.id}>
              <td>{b.account}</td>
              <td>{observed(b.targetRevision)}</td>
              <td>{observed(b.receivedRevision)}</td>
              <td>{observed(b.appliedRevision)}</td>
              <td>{b.serverState}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!bindings.length && <p>当前授权目录没有账号绑定记录。</p>}
      {bindings.map((b) => (
        <div key={b.id}>
          <strong>{b.account}</strong>
          <dl>
            {b.observations.map((o) => (
              <div key={o.key}>
                <dt>{o.key}</dt>
                <dd>
                  {o.value ?? '未观察'} · {o.state}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <p>应用会话：未在设备摘要中查询。</p>
    </section>
  )
}
export function EnterprisePasskeySummary({
  deviceId,
  records,
  onDetail,
}: {
  deviceId: string
  records: PasskeyRecord[]
  onDetail?: (record: PasskeyRecord) => void
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>网站 / 账号</th>
          <th>Passkey</th>
          <th>本机同步状态</th>
          <th>详情</th>
        </tr>
      </thead>
      <tbody>
        {records
          .filter((r) => r.device === deviceId && r.scope === 'enterprise')
          .map((r) => (
            <tr key={r.id}>
              <td>
                {r.rp} / {r.account}
              </td>
              <td>{r.label}</td>
              <td>{r.state}</td>
              <td>{onDetail && <Button onClick={() => onDetail(r)}>详情</Button>}</td>
            </tr>
          ))}
      </tbody>
    </table>
  )
}
export function RecoveryMetadataSummary({ materials }: { materials: Material[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>材料类型</th>
          <th>材料版本</th>
          <th>托管</th>
          <th>有效性</th>
        </tr>
      </thead>
      <tbody>
        {materials.map((m) => (
          <tr key={`${m.id}:${m.version}`}>
            <td>{m.subject.kind}</td>
            <td>v{m.version}</td>
            <td>{m.escrowed ? '已托管' : '未托管'}</td>
            <td>{m.validity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
export function AccessAutomationStatus({ operation: o }: { operation: OriginalOperation }) {
  return (
    <section aria-label="原操作结果">
      <p>原操作 {o.id}</p>
      <Tag>{o.state}</Tag>
      <dl>
        {o.observations.map((v) => (
          <div key={v.key}>
            <dt>{v.key}</dt>
            <dd>
              {v.value ?? '未观察'} · {v.state}
            </dd>
          </div>
        ))}
      </dl>
      <p>服务端受理不证明设备效果；空观察不表示完成。</p>
    </section>
  )
}
