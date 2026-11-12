import { usePendingSelection } from './SelectionGuard'
import { useState } from 'react'
import { Alert, Button, Card, Checkbox, Form, Input, Modal, Select, Space } from 'antd'
import type {
  Association,
  ConfirmAssociation,
  RevokeAssociation,
  ViewEndpoint,
} from '@rss/mdm-devices'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, useRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { Status } from './DevicePresentation'

export function AssociationEditor({
  runtime,
  locale,
  endpoint,
  prior = null,
  onChanged,
}: {
  runtime: Runtime
  locale: Locale
  endpoint: ViewEndpoint
  prior?: Association | null
  onChanged(): void
}) {
  const l = labels(locale),
    { devices, binding } = useAdministration(runtime),
    action = useAction()
  const [open, setOpen] = useState(false),
    [channel, setChannel] = useState<'mdm' | 'agent'>(
      endpoint.channel === 'mdm' && endpoint.status === 'active' ? 'mdm' : 'agent',
    ),
    [cursor, setCursor] = useState<string>(),
    [candidate, setCandidate] = useState<string>(),
    [evidence, setEvidence] = useState(''),
    [verified, setVerified] = useState(false),
    [change, setChange] = useState<ConfirmAssociation | null>(null),
    [revoke, setRevoke] = useState<RevokeAssociation | null>(null),
    [sent, setSent] = useState(false),
    [outcome, setOutcome] = useState<'none' | 'unknown' | 'rejected' | 'confirmed'>('none')
  const candidates = useRead(
    `${binding}/candidates/${endpoint.id}/${channel}/${cursor ?? ''}/${open}`,
    (signal) =>
      open
        ? devices.candidates(endpoint.id, channel, cursor ? { cursor } : {}, signal)
        : Promise.resolve(null),
    { retryReadConflict: !cursor },
  )
  const locked = sent && outcome !== 'rejected' && outcome !== 'confirmed'
  usePendingSelection(action.busy || locked)
  async function submit() {
    if ((!change && !revoke) || (change && !verified)) return
    setSent(true)
    const result = await action.run(() =>
      change ? devices.confirm(change) : devices.revoke(prior!.id, revoke!),
    )
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) onChanged()
  }
  function clear() {
    setChange(null)
    setRevoke(null)
    setSent(false)
    setOutcome('none')
    setVerified(false)
    action.clear()
  }
  return (
    <Card title={l('终端关联', 'Endpoint association')}>
      {prior ? (
        <p>
          <Status value={prior.state} locale={locale} /> <code>{prior.id}</code> ·{' '}
          {l('关系版本', 'Association version')} {prior.version}
        </p>
      ) : (
        <p>
          {l(
            '此终端尚未关联。候选只用于人工核验，不证明属于同一设备。',
            'This endpoint is not associated. Candidates require human verification that they are the same device.',
          )}
        </p>
      )}
      <Button onClick={() => setOpen(true)}>
        {prior
          ? l('核验或撤销关系', 'Verify or revoke association')
          : l('关联另一通道终端', 'Associate another endpoint')}
      </Button>
      <Modal
        open={open}
        getContainer={false}
        width={760}
        title={l('核验终端关联', 'Verify endpoint association')}
        footer={null}
        onCancel={() => {
          if (!locked && !action.busy) {
            setOpen(false)
            clear()
          }
        }}
        maskClosable={!locked && !action.busy}
        closable={!locked && !action.busy}
      >
        <Alert
          type="info"
          title={l(
            '确认两端属于同一实际设备。新设备必须重新核验；关联不会合并终端身份或人员。',
            'Verify both endpoints are the same physical device. Reverify new devices; association does not merge endpoint identities or people.',
          )}
        />
        <Failure error={action.error} locale={locale} />
        <Form layout="vertical" disabled={action.busy || change !== null || revoke !== null}>
          <Form.Item label={l('当前终端通道', 'Current endpoint channel')}>
            <Select
              aria-label={l('当前终端通道', 'Current endpoint channel')}
              value={channel}
              options={
                endpoint.status === 'active' && endpoint.channel
                  ? [
                      {
                        value: endpoint.channel,
                        label: endpoint.channel === 'mdm' ? 'MDM' : 'Agent',
                      },
                    ]
                  : []
              }
              onChange={(value: 'mdm' | 'agent') => {
                setChannel(value)
                setCursor(undefined)
                setCandidate(undefined)
              }}
            />
          </Form.Item>
          <ReadState
            busy={candidates.busy}
            error={candidates.error}
            locale={locale}
            onRetry={candidates.reload}
            onRestart={() => (cursor ? setCursor(undefined) : candidates.reload())}
          />
          <Form.Item label={l('对侧通道候选终端', 'Candidate on the other channel')}>
            <Select
              aria-label={l('对侧通道候选终端', 'Candidate on the other channel')}
              virtual={false}
              value={candidate}
              options={(candidates.value?.items ?? []).map((member) => ({
                value: member.device,
                label: `${member.device} · ${member.channel}`,
              }))}
              onChange={setCandidate}
            />
          </Form.Item>
          <Space wrap>
            <Button disabled={!cursor} onClick={() => setCursor(undefined)}>
              {l('候选首页', 'First candidates')}
            </Button>
            <Button
              disabled={!candidates.value?.nextCursor}
              onClick={() => {
                if (candidates.value?.nextCursor) setCursor(candidates.value.nextCursor)
              }}
            >
              {l('继续查找候选', 'Continue candidates')}
            </Button>
          </Space>
          <Form.Item label={l('核验证据或撤销理由', 'Verification evidence or revocation reason')}>
            <Input.TextArea
              aria-label={l('核验证据或撤销理由', 'Verification evidence or revocation reason')}
              value={evidence}
              maxLength={2048}
              onChange={(event) => setEvidence(event.target.value)}
            />
          </Form.Item>
          <Space wrap>
            <Button
              disabled={!candidate || !evidence.trim()}
              onClick={() =>
                void action
                  .run(() =>
                    devices.prepareConfirmation(
                      crypto.randomUUID(),
                      channel === 'mdm' ? endpoint.id : candidate!,
                      channel === 'agent' ? endpoint.id : candidate!,
                      evidence,
                      prior?.id ?? null,
                    ),
                  )
                  .then((result) => {
                    if (result.ok) {
                      setChange(result.value)
                      setVerified(false)
                    }
                  })
              }
            >
              {l('读取并核对当前终端', 'Read current endpoints for verification')}
            </Button>
            {prior && (
              <Button
                danger
                disabled={!evidence.trim()}
                onClick={() =>
                  void action
                    .run(() => devices.prepareRevocation(prior.id, crypto.randomUUID(), evidence))
                    .then((result) => {
                      if (result.ok) setRevoke(result.value)
                    })
                }
              >
                {l('读取撤销版本', 'Read version for revocation')}
              </Button>
            )}
          </Space>
        </Form>
        {change && (
          <div className="device-editor">
            <dl className="device-facts">
              {[change.mdm, change.agent].map((member) => (
                <div key={member.channel}>
                  <dt>{member.channel === 'mdm' ? 'MDM' : 'Agent'}</dt>
                  <dd>
                    <code>{member.device}</code>
                    <br />
                    {l('通道', 'Channel')} · {member.channel}
                  </dd>
                </div>
              ))}
            </dl>
            <p>{change.evidence}</p>
            <Checkbox
              checked={verified}
              disabled={action.busy || sent}
              onChange={(event) => setVerified(event.target.checked)}
            >
              {l(
                '已核实两端属于同一实际设备',
                'I verified these endpoints belong to the same physical device',
              )}
            </Checkbox>
          </div>
        )}
        {revoke && (
          <Alert
            type="warning"
            title={`${l('将撤销关系版本', 'Revoke association version')} ${revoke.expectedVersion} · ${revoke.reason}`}
          />
        )}
        {(change || revoke) && outcome !== 'confirmed' && (
          <div className="admin-recovery">
            <code>{change?.operationId ?? revoke?.operationId}</code>
            <Space wrap>
              <Button
                type="primary"
                danger={revoke !== null}
                disabled={action.busy || (change !== null && !verified)}
                onClick={() => void submit()}
              >
                {sent && outcome === 'unknown'
                  ? l('显式重提原关系请求', 'Resubmit original association request')
                  : revoke
                    ? l('确认撤销关系', 'Confirm revocation')
                    : l('确认关联', 'Confirm association')}
              </Button>
              {!sent && (
                <Button disabled={action.busy} onClick={clear}>
                  {l('重新选择', 'Choose again')}
                </Button>
              )}
              {outcome === 'rejected' && (
                <Button
                  disabled={action.busy}
                  onClick={() => {
                    clear()
                    candidates.reload()
                    onChanged()
                  }}
                >
                  {l('放弃已拒绝请求并重读', 'Discard rejected request and read again')}
                </Button>
              )}
              {outcome === 'unknown' && (
                <a href="/devices?tab=associations" target="_blank" rel="noopener noreferrer">
                  {l('在新窗口比较当前关系', 'Compare current associations in a new window')}
                </a>
              )}
            </Space>
          </div>
        )}
        {outcome === 'confirmed' && (
          <Alert
            type="success"
            title={l('原关系操作已确认。', 'The original association operation is confirmed.')}
          />
        )}
      </Modal>
    </Card>
  )
}
