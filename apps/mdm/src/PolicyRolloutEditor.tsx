import { Button, Checkbox, Form, InputNumber, Space } from 'antd'
import type { RolloutStage } from '@rss/mdm-policies'
import { emptyScope, PolicyScope, type PolicyScopeProps } from './PolicyScope'
import { labels } from './AdminUi'

export function PolicyRolloutEditor({ value, onChange, ...scopeProps }: Omit<PolicyScopeProps, 'value' | 'onChange' | 'saved'> & {
  value: readonly RolloutStage[]; onChange(value: readonly RolloutStage[]): void;
  savedScopes: readonly NonNullable<PolicyScopeProps['saved']>[]
}) {
  const l = labels(scopeProps.locale)
  function update(index: number, stage: RolloutStage) { onChange(value.map((item, i) => i === index ? stage : item)) }
  function add() { onChange([...value, { id: crypto.randomUUID(), scope: emptyScope(), opensAt: value.length ? (value.at(-1)!.opensAt + 3600) : 0, minimumVerifiedPercent: null }]) }
  function move(index: number, delta: number) {
    const next = [...value], other = index + delta, first = next[index]!, second = next[other]!
    next[index] = { ...second, opensAt: first.opensAt }
    next[other] = { ...first, opensAt: second.opensAt }
    onChange(next.map((stage, i) => i === 0 ? { ...stage, minimumVerifiedPercent: null } : stage))
  }
  return <section aria-label={l('部署批次', 'Rollout stages')}>
    <fieldset className="permission-panel" disabled={scopeProps.disabled}>
      <Checkbox checked={value.length > 0} onChange={e => e.target.checked ? add() : onChange([])}>{l('分批部署', 'Deploy in stages')}</Checkbox>
      <p>{value.length ? l('成员受策略总范围限制；重叠设备归最早批次。未知与等待重启不计为核实成功。', 'Stage members are constrained by the overall policy scope. Overlap belongs to the earliest stage; unknown and waiting for reboot do not count as verified success.') : l('不分批部署，使用策略总范围。', 'Deploy without stages using the overall policy scope.')}</p>
    </fieldset>
    {value.map((stage, index) => <fieldset className="asset-editor-section" key={stage.id}>
      <legend>{l('批次', 'Stage')} {index + 1}</legend>
      <fieldset className="permission-panel" disabled={scopeProps.disabled}>
        <Form.Item label={l('开放时间（UTC Unix 秒）', 'Opens at (UTC Unix seconds)')}><InputNumber aria-label={`${l('批次开放时间', 'Stage opens at')} ${index + 1}`} min={0} precision={0} value={stage.opensAt} onChange={opensAt => { if (opensAt !== null) update(index, { ...stage, opensAt }) }} /></Form.Item>
        {index > 0 && <><Checkbox checked={stage.minimumVerifiedPercent !== null} onChange={e => update(index, { ...stage, minimumVerifiedPercent: e.target.checked ? 90 : null })}>{l('要求上一批核实成功率', 'Require preceding stage verified success')}</Checkbox>{stage.minimumVerifiedPercent !== null && <InputNumber aria-label={l('最低核实成功率（%）', 'Minimum verified success (%)')} min={0} max={100} precision={0} value={stage.minimumVerifiedPercent} onChange={minimumVerifiedPercent => { if (minimumVerifiedPercent !== null) update(index, { ...stage, minimumVerifiedPercent }) }} />}</>}
        <Space wrap><Button disabled={index === 0} onClick={() => move(index, -1)}>{l('上移批次', 'Move stage up')}</Button><Button disabled={index === value.length - 1} onClick={() => move(index, 1)}>{l('下移批次', 'Move stage down')}</Button><Button danger onClick={() => onChange(value.filter(item => item.id !== stage.id).map((item, i) => i === 0 ? { ...item, minimumVerifiedPercent: null } : item))}>{l('移除此批次', 'Remove stage')}</Button></Space>
      </fieldset>
      <PolicyScope {...scopeProps} owner={{ policyId: scopeProps.owner.policyId, stageId: stage.id }} value={stage.scope} onChange={scope => update(index, { ...stage, scope })} saved={scopeProps.savedScopes.find(item => item.stage === stage.id && !item.retired) ?? null} />
    </fieldset>)}
    {value.length > 0 && <Button disabled={scopeProps.disabled || value.length >= 32} onClick={add}>{l('添加批次', 'Add stage')}</Button>}
  </section>
}
