import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import { useRef, useState } from 'react'
import { Alert, Button, Card, Checkbox, Form, Input, Select, Space } from 'antd'
import { nativeIntent, windowsEnrollmentLink, type NativeIntent } from '@rss/mdm-enrollment'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { codeOf, Failure, isUnknown, labels, ReadState, useAction, useRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { Status, statusText, timestamp } from './DevicePresentation'
import {
  generateEnrollmentSecret,
  inputFingerprint,
  useProtectedDelivery,
} from './useProtectedDelivery'
import { NativeMaintenance } from './NativeMaintenance'
export function EnrollmentFailure({ error, locale }: { error: unknown; locale: Locale }) {
  const l = labels(locale),
    code = codeOf(error)
  return code === 'enrollment_paused' ? (
    <Alert
      type="warning"
      title={l(
        '后台已暂停新注册。请重新读取准入；已有设备维护和公开下载仍可使用。',
        'The backend paused new enrollment. Read admission again; existing maintenance and public downloads remain available.',
      )}
    />
  ) : code === 'registration_limit' ? (
    <Alert
      type="warning"
      title={l(
        '后台拒绝注册：额度不足。请查看配额或联系管理员。',
        'The backend rejected enrollment because of quota. Review the quota or contact an administrator.',
      )}
    />
  ) : (
    <Failure error={error} locale={locale} />
  )
}
export function NativeEnrollment({
  runtime,
  locale,
  deviceId,
  initialEnrollment = '',
}: {
  runtime: Runtime
  locale: Locale
  deviceId?: string
  initialEnrollment?: string
}) {
  const maintenance = useSelectionGuard()
  const l = labels(locale),
    { enrollment, binding } = useAdministration(runtime),
    action = useAction(),
    profileAction = useAction(),
    options = useRead(`${binding}/native-options`, enrollment.selfOptions),
    channels = useRead(`${binding}/native-admission`, enrollment.channels)
  const [source, setSource] = useState<'mdm.windows' | 'mdm.apple'>('mdm.windows'),
    [windowsProfile, setWindowsProfile] = useState<'Full' | 'Device'>('Full'),
    [password, setPassword] = useState(''),
    [fingerprint, setFingerprint] = useState(''),
    [saved, setSaved] = useState(false),
    [recoveryPassword, setRecoveryPassword] = useState(''),
    [id, setId] = useState(initialEnrollment),
    [idDraft, setIdDraft] = useState(initialEnrollment),
    [pending, setPending] = useState<{ intent: NativeIntent; fingerprint: string } | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none')
  const currentId = useRef(id)
  const delivery = useProtectedDelivery(() => {
      setPassword('')
      setFingerprint('')
      setSaved(false)
      setRecoveryPassword('')
    }),
    read = useRead(`${binding}/enrollment/${id}`, () =>
      id ? enrollment.enrollment(id) : Promise.resolve(null),
    ),
    channel = channels.value?.channels.find(
      (c) => c.channel === (source === 'mdm.windows' ? 'windows_mdm' : 'macos_mdm'),
    ),
    offered = options.value?.channels.some((c) => c.source === source) ?? false,
    paused = channel?.admission === 'paused',
    unavailable = !channel || channel.availability !== 'ready',
    locked =
      maintenance.locked || (pending !== null && outcome !== 'confirmed' && outcome !== 'rejected')
  usePendingSelection(action.busy || locked)
  function selectEnrollment(next: string) {
    if (currentId.current !== next) {
      currentId.current = next
      delivery.clear()
      setRecoveryPassword('')
    }
    setId(next)
    setIdDraft(next)
  }
  async function submit(original: { intent: NativeIntent; fingerprint: string }, secret: string) {
    const result = await action.run(async () => {
      if ((await inputFingerprint(secret)) !== original.fingerprint)
        throw { cause: 'client', code: 'input_changed' }
      return enrollment.createNative(original.intent, secret)
    })
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) {
      selectEnrollment(result.value.enrollmentId)
      options.reload()
      channels.reload()
    } else if (['enrollment_paused', 'registration_limit'].includes(codeOf(result.error))) {
      options.reload()
      channels.reload()
    }
  }
  const nativeLink = read.value ? windowsEnrollmentLink(read.value.instructions) : null
  return (
    <div className="enrollment-layout">
      <Card
        title={
          deviceId
            ? l('为此终端发起原生注册', 'Create native enrollment for this endpoint')
            : l('注册我的设备', 'Enroll my device')
        }
      >
        <Alert
          type="info"
          title={l(
            'Windows/macOS 使用原生系统注册。Agent 固定包可匿名下载，安装注册使用管理员交付的 JSON 文件。',
            'Windows/macOS use native enrollment. Agent installers are public; Agent enrollment uses an administrator-issued JSON file.',
          )}
        />
        <ReadState
          busy={options.busy || channels.busy}
          error={options.error ?? channels.error}
          locale={locale}
        />
        <EnrollmentFailure error={action.error} locale={locale} />
        {options.value && (
          <DataTable
            locale={locale}
            dataSource={options.value.quotas.channels}
            rowKey="channel"
            columns={[
              {
                title: l('通道', 'Channel'),
                dataIndex: 'channel',
                render: (_, channel) =>
                  channel.channel === 'agent'
                    ? 'Agent'
                    : channel.channel === 'windows_mdm'
                      ? 'Windows MDM'
                      : 'macOS MDM',
              },
              { title: l('额度', 'Limit'), dataIndex: 'limit' },
              { title: l('有效注册', 'Active'), dataIndex: 'active' },
              { title: l('预留', 'Reserved'), dataIndex: 'reserved' },
              { title: l('已用', 'Used'), dataIndex: 'used' },
              { title: l('超出额度', 'Over limit'), dataIndex: 'overLimit' },
            ]}
          />
        )}
        <p className="subtitle">
          {l(
            '配额仅显示后台用量，能否注册由后台在提交时裁决。',
            'Quota is a server usage snapshot. The backend decides admission when the request is submitted.',
          )}
        </p>
        <Button
          onClick={() => {
            options.reload()
            channels.reload()
          }}
        >
          {l('重新读取准入与配额', 'Read admission and quota again')}
        </Button>
        <Form
          layout="vertical"
          className="device-editor"
          disabled={action.busy || pending !== null || !!id}
        >
          <Form.Item label={l('设备平台', 'Device platform')}>
            <Select
              aria-label={l('设备平台', 'Device platform')}
              value={source}
              options={[
                { value: 'mdm.windows', label: 'Windows' },
                { value: 'mdm.apple', label: 'macOS' },
              ]}
              onChange={(value: 'mdm.windows' | 'mdm.apple') => {
                setSource(value)
                delivery.clear()
                setPassword('')
                setFingerprint('')
                setSaved(false)
              }}
            />
          </Form.Item>
          {source === 'mdm.windows' && (
            <Form.Item label={l('Windows 注册模式', 'Windows enrollment mode')}>
              <Select
                aria-label={l('Windows 注册模式', 'Windows enrollment mode')}
                value={windowsProfile}
                options={[
                  { value: 'Full', label: l('完整原生管理', 'Full native management') },
                  { value: 'Device', label: l('设备模式', 'Device mode') },
                ]}
                onChange={setWindowsProfile}
              />
            </Form.Item>
          )}
          {channel && (
            <p>
              <Status value={channel.admission} locale={locale} />
              <Status value={channel.availability} locale={locale} />
            </p>
          )}
          {!offered && !options.busy && (
            <Alert
              type="warning"
              title={l(
                '后台尚未提供此原生注册入口。',
                'The backend does not currently offer this native enrollment entry.',
              )}
            />
          )}
          <Button
            disabled={action.busy || pending !== null || !!id || !offered || paused || unavailable}
            onClick={() => {
              delivery.clear()
              setPassword('')
              setSaved(false)
              const ticket = delivery.capture()
              void action
                .run(async () => {
                  const secret = generateEnrollmentSecret(),
                    fingerprint = await inputFingerprint(secret)
                  return { secret, fingerprint }
                })
                .then((result) => {
                  if (result.ok && delivery.isCurrent(ticket)) {
                    setPassword(result.value.secret)
                    setFingerprint(result.value.fingerprint)
                  }
                })
            }}
          >
            {l('准备一次性注册密码', 'Prepare an enrollment password')}
          </Button>
          {password && (
            <>
              <Form.Item label={l('本次原生注册密码', 'Native enrollment password')}>
                <Input.Password
                  aria-label={l('本次原生注册密码', 'Native enrollment password')}
                  value={password}
                  readOnly
                  autoComplete="off"
                />
              </Form.Item>
              <Alert
                type="warning"
                title={l(
                  '先保存本次密码，用于系统原生注册。提交后页面清除密码；隐藏页面也会清除。',
                  'Save this password for the native system flow. The page clears it on submission or when hidden.',
                )}
              />
              <Checkbox checked={saved} onChange={(event) => setSaved(event.target.checked)}>
                {l('已保存本次注册密码', 'I saved this enrollment password')}
              </Checkbox>
              <Button
                type="primary"
                disabled={!saved || action.busy || pending !== null}
                onClick={() => {
                  const secret = password,
                    original = {
                      intent: nativeIntent(crypto.randomUUID(), source, windowsProfile, deviceId),
                      fingerprint,
                    }
                  setPending(original)
                  setPassword('')
                  setFingerprint('')
                  setSaved(false)
                  delivery.clear()
                  void submit(original, secret)
                }}
              >
                {l('提交原生注册申请', 'Create native enrollment')}
              </Button>
            </>
          )}
        </Form>
        {pending && outcome !== 'confirmed' && (
          <div className="admin-recovery">
            <code>{pending.intent.operationId}</code>
            {outcome === 'rejected' ? (
              <Button
                disabled={action.busy}
                onClick={() => {
                  setPending(null)
                  setOutcome('none')
                  action.clear()
                  options.reload()
                  channels.reload()
                }}
              >
                {l('放弃已拒绝请求并重读', 'Discard rejected request and read again')}
              </Button>
            ) : (
              <>
                <Alert
                  type="warning"
                  title={l(
                    '原申请结果未知。请输入原密码后显式重提相同申请，不生成新申请。',
                    'The original outcome is unknown. Re-enter the original password to explicitly resubmit that request.',
                  )}
                />
                <Input.Password
                  aria-label={l('重提时输入原注册密码', 'Original password for resubmission')}
                  value={recoveryPassword}
                  autoComplete="off"
                  onChange={(event) => setRecoveryPassword(event.target.value)}
                />
                <Button
                  disabled={action.busy || !recoveryPassword}
                  onClick={() => {
                    const secret = recoveryPassword
                    setRecoveryPassword('')
                    void submit(pending, secret)
                  }}
                >
                  {l('显式重提原注册申请', 'Resubmit original enrollment')}
                </Button>
              </>
            )}
          </div>
        )}
      </Card>
      <Card title={l('原生注册进度', 'Native enrollment progress')}>
        <Form
          className="admin-toolbar"
          layout="inline"
          onFinish={() => {
            if (locked && idDraft !== id) return
            selectEnrollment(idDraft)
            read.reload()
          }}
        >
          <Form.Item label={l('注册申请标识', 'Enrollment ID')}>
            <Input
              aria-label={l('注册申请标识', 'Enrollment ID')}
              value={idDraft}
              placeholder="UUID"
              disabled={locked}
              onChange={(event) => setIdDraft(event.target.value)}
            />
          </Form.Item>
          <Button htmlType="submit" disabled={locked && idDraft !== id}>
            {l('读取原生注册进度', 'Read native enrollment progress')}
          </Button>
        </Form>
        <ReadState busy={read.busy} error={read.error} locale={locale} />
        {read.value && (
          <>
            <p>
              <Status value={read.value.status} locale={locale} /> ·{' '}
              {timestamp(locale, read.value.expiresAt)}
            </p>
            <Alert
              type={read.value.progress.managementReady ? 'success' : 'info'}
              title={
                read.value.progress.managementReady
                  ? l('后台已确认管理就绪。', 'The backend confirmed management readiness.')
                  : l(
                      '管理尚未就绪。注册申请或配置文件下载不代表设备注册完成。',
                      'Management is not ready. Creating enrollment or downloading a profile does not prove device enrollment completed.',
                    )
              }
            />
            <dl className="device-facts">
              <div>
                <dt>{l('配置文件准备', 'Profile prepared')}</dt>
                <dd>{statusText(locale, read.value.progress.profilePrepared)}</dd>
              </div>
              <div>
                <dt>{l('证书已签发', 'Certificate issued')}</dt>
                <dd>
                  {read.value.progress.certificateIssued
                    ? l('已观察到', 'Observed')
                    : l('未观察到', 'Not observed')}
                </dd>
              </div>
              <div>
                <dt>{l('首次认证通信', 'First authenticated check-in')}</dt>
                <dd>
                  {read.value.progress.firstAuthenticatedCheckIn
                    ? l('已观察到', 'Observed')
                    : l('未观察到', 'Not observed')}
                </dd>
              </div>
              <div>
                <dt>{l('系统确认', 'System confirmation')}</dt>
                <dd>{statusText(locale, read.value.progress.systemConfirmation)}</dd>
              </div>
              <div>
                <dt>{l('当前诊断', 'Current diagnostic')}</dt>
                <dd>{read.value.progress.diagnostic}</dd>
              </div>
            </dl>
            {read.value.instructions.platform === 'windows' && (
              <dl className="device-facts">
                <div>
                  <dt>{l('服务器', 'Server')}</dt>
                  <dd>{read.value.instructions.server}</dd>
                </div>
                <div>
                  <dt>{l('系统注册账户', 'Native protocol account')}</dt>
                  <dd>{read.value.instructions.username}</dd>
                </div>
                <div>
                  <dt>{l('本机管理员', 'Local administrator')}</dt>
                  <dd>
                    {read.value.instructions.requiresLocalAdministrator
                      ? l('需要', 'Required')
                      : l('不需要', 'Not required')}
                  </dd>
                </div>
              </dl>
            )}
            {nativeLink && (
              <a className="button-link" href={nativeLink}>
                {l('打开 Windows 原生注册', 'Open Windows native enrollment')}
              </a>
            )}
            {read.value.instructions.platform === 'windows_entra' && (
              <p>
                {l(
                  '在 Windows 的工作或学校账户入口完成 Entra 注册。',
                  'Complete Entra enrollment from Windows work or school account settings.',
                )}
              </p>
            )}
            {read.value.instructions.platform === 'macos_account' && (
              <>
                <p>{read.value.instructions.managedAccount}</p>
                <a href={runtime.onboarding.appleBridgeUrl()}>
                  {l('进入 Apple 受管账户认证', 'Continue with managed Apple account')}
                </a>
              </>
            )}
            {read.value.instructions.platform === 'macos_ade' && (
              <p>
                {l(
                  '在具备资格的 ADE 设备系统设置中继续；后台记录不证明组织或真机资格。',
                  'Continue in system setup on an eligible ADE device. Backend records do not prove external organization or device eligibility.',
                )}
              </p>
            )}
            {read.value.instructions.platform === 'unavailable' && (
              <Alert
                type="warning"
                title={l(
                  '当前无可用的系统注册指引，请查看后台诊断。',
                  'Native instructions are unavailable. Review the backend diagnostic.',
                )}
              />
            )}
            {read.value.instructions.platform === 'macos' && (
              <div className="device-editor">
                <Input.Password
                  aria-label={l(
                    '下载原生配置时输入注册密码',
                    'Enrollment password for profile download',
                  )}
                  value={recoveryPassword}
                  autoComplete="off"
                  onChange={(event) => setRecoveryPassword(event.target.value)}
                />
                <Button
                  disabled={profileAction.busy || !recoveryPassword}
                  onClick={() => {
                    const secret = recoveryPassword,
                      requestedId = id
                    setRecoveryPassword('')
                    delivery.clear()
                    const ticket = delivery.capture()
                    void profileAction.run(async () => {
                      const file = await enrollment.profile(requestedId, secret)
                      if (currentId.current !== requestedId) {
                        new Uint8Array(file.bytes).fill(0)
                        return false
                      }
                      return delivery.deliver(file, ticket)
                    })
                  }}
                >
                  {l(
                    '受保护下载 macOS 配置描述文件',
                    'Download protected macOS enrollment profile',
                  )}
                </Button>
                <Failure error={profileAction.error} locale={locale} kind="read" />
              </div>
            )}
          </>
        )}
        {delivery.download && (
          <Space wrap>
            <a
              className="button-link"
              href={delivery.download.url}
              download={delivery.download.filename}
            >
              {l('保存原生配置描述文件', 'Save native enrollment profile')}
            </a>
            <Button onClick={delivery.clear}>{l('清除下载', 'Clear download')}</Button>
          </Space>
        )}
        {id && (
          <SelectionGuard.Provider value={maintenance.register}>
            <NativeMaintenance
              key={id}
              runtime={runtime}
              locale={locale}
              id={id}
              onChanged={read.reload}
            />
          </SelectionGuard.Provider>
        )}
      </Card>
    </div>
  )
}
