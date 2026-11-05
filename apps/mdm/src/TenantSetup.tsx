import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Steps,
} from 'antd'
import { Link } from 'react-router-dom'
import { capabilities, channels } from '@rss/mdm-tenant-setup'
import type { Capability, Command, Intent, Progress } from '@rss/mdm-tenant-setup'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import {
  codeOf,
  Failure,
  Heading,
  isUnknown,
  labels,
  ReadState,
  useAction,
  usePageRead,
  validateInput,
} from './AdminUi'
import { useAdministration } from './useAdministration'
import { setupDestination, setupName } from './setup-presentation'
import { SetupStatus } from './SetupStatus'
const empty: Intent = { channels: [], capabilities: {}, completionRequested: false }
export function TenantSetup({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const { tenantSetup, binding, authorization } = useAdministration(runtime)
  if (!tenantSetup) return null
  return (
    <SetupJourney
      key={binding}
      runtime={runtime}
      locale={locale}
      setup={tenantSetup}
      binding={binding}
      effective={authorization.effective}
    />
  )
}
function SetupJourney({
  runtime,
  locale,
  setup,
  binding,
  effective,
}: {
  runtime: Runtime
  locale: Locale
  setup: NonNullable<ReturnType<Runtime['administration']>['tenantSetup']>
  binding: string
  effective: ReturnType<Runtime['administration']>['authorization']['effective']
}) {
  const l = labels(locale),
    action = useAction(),
    pending = useSyncExternalStore(setup.subscribe, setup.getSnapshot),
    permissions = usePageRead(`${binding}/setup-permissions`, effective),
    progress = usePageRead(`${binding}/setup`, setup.read),
    [draft, setDraft] = useState<Intent | null>(null),
    [baseRevision, setBaseRevision] = useState(0),
    [step, setStep] = useState(0),
    [lookup, setLookup] = useState(''),
    [receipt, setReceipt] = useState(''),
    [reauth, setReauth] = useState(false),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(false),
    [denied, setDenied] = useState(false),
    state = useSyncExternalStore(runtime.owner.subscribe, runtime.owner.getSnapshot)
  useEffect(() => {
    if (!draft && progress.value) {
      setDraft(progress.value.saved.intent)
      setBaseRevision(progress.value.saved.revision)
    }
  }, [progress.value, draft])
  useEffect(() => {
    const clear = () => {
      if (document.visibilityState === 'hidden') setPassword('')
    }
    document.addEventListener('visibilitychange', clear)
    return () => document.removeEventListener('visibilitychange', clear)
  }, [])
  const has = (operation: string) =>
      !denied &&
      !permissions.busy &&
      !permissions.error &&
      (permissions.value?.grants.some(
        (g) => g.scope.kind === 'tenant' && g.operation === operation,
      ) ??
        false),
    canRead = has('registration_configuration_read'),
    canWrite = has('registration_configuration_write'),
    current = canRead ? progress.value : undefined,
    selection = draft ?? empty,
    dirty = !!draft && !!current && JSON.stringify(draft) !== JSON.stringify(current.saved.intent),
    locked = action.busy || !!pending || !canWrite || !current,
    stages = [
      l('选择管理方式', 'Choose management'),
      l('准备与配置', 'Prepare and configure'),
      l('核对并完成', 'Review and finish'),
    ]
  function refresh() {
    setDenied(false)
    setReceipt('')
    permissions.reload()
    progress.reload()
  }
  async function execute(command: Command) {
    const result = await action.run(() => setup.submit(command))
    if (result.ok) {
      setDraft(null)
      setReceipt(result.value.operationId)
      progress.reload()
    } else {
      if (isUnknown(result.error)) setup.uncertain(command)
      if (codeOf(result.error) === 'forbidden') {
        setDenied(true)
        progress.reload()
        permissions.reload()
      }
      if (
        !isUnknown(result.error) &&
        !['reauthentication_required', 'interaction_required'].includes(codeOf(result.error))
      )
        setup.rejected(command)
    }
  }
  async function save(completionRequested: boolean) {
    if (locked || !draft || !current) return
    let command: Command
    try {
      validateInput(() => {
        command = setup.prepare(crypto.randomUUID(), baseRevision, {
          ...draft,
          completionRequested,
        })
      })
    } catch (error) {
      await action.run(() => Promise.reject(error))
      return
    }
    setConfirm(false)
    await execute(command!)
  }
  async function query() {
    const id = pending?.operationId ?? lookup
    const result = await action.run(() => setup.operation(id))
    if (result.ok) {
      setReceipt(result.value.operationId)
      setDraft(null)
      progress.reload()
    } else if (codeOf(result.error) === 'forbidden') {
      setDenied(true)
      permissions.reload()
      progress.reload()
    }
  }
  function decision(key: Capability, kind: string) {
    const next = { ...selection.capabilities }
    if (!kind) delete next[key]
    else next[key] = kind === 'skip' ? { kind: 'skip', reason: '' } : { kind: 'configure' }
    setDraft({ ...selection, capabilities: next, completionRequested: false })
  }
  return (
    <div className="admin-stack setup-page">
      <Heading
        title={l('租户初始化', 'Tenant setup')}
        hint={l(
          '保存管理意图，在各模块完成实际配置，再核对当前观察。可以随时离开，返回后继续。',
          'Save your management intent, configure each module, then review current observations. Leave and return to continue.',
        )}
        actions={
          <Button onClick={refresh} disabled={action.busy}>
            {l('刷新当前状态', 'Refresh current state')}
          </Button>
        }
      />
      <Space wrap>
        <Link to="/settings">{l('全部设置', 'All settings')}</Link>
        <Link to="/diagnostics">{l('运行诊断', 'Runtime diagnostics')}</Link>
        <Link to="/">{l('工作台', 'Workspace')}</Link>
      </Space>
      <ReadState locale={locale} busy={permissions.busy} error={permissions.error} />
      {!canRead && !permissions.busy && !permissions.error && (
        <Alert
          type="info"
          title={l('当前账户没有初始化读取权限。', 'This account cannot read tenant setup.')}
        />
      )}
      {canRead && <ReadState locale={locale} busy={progress.busy} error={progress.error} />}
      {canRead && <Failure locale={locale} error={action.error} />}
      {current && (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2>{l('当前进度', 'Current progress')}</h2>
              <SetupStatus
                locale={locale}
                value={current.complete ? 'completed' : current.canComplete ? 'ready' : 'pending'}
              />
            </div>
            <div className="panel-body">
              <Descriptions
                size="small"
                column={1}
                items={[
                  {
                    key: 'revision',
                    label: l('后端保存版本', 'Saved revision'),
                    children: current.saved.revision,
                  },
                  {
                    key: 'confirmation',
                    label: l('完成意图已确认', 'Completion intent confirmed'),
                    children: current.saved.intent.completionRequested
                      ? l('是', 'Yes')
                      : l('否', 'No'),
                  },
                  {
                    key: 'health',
                    label: l('当前配置满足条件', 'Current configuration meets requirements'),
                    children: current.canComplete ? l('是', 'Yes') : l('否', 'No'),
                  },
                ]}
              />
              {current.saved.intent.completionRequested && (
                <Alert
                  type={current.complete ? 'success' : 'warning'}
                  title={
                    current.complete
                      ? l(
                          '初始化已确认，后续健康仍按当前观察更新。',
                          'Setup confirmed. Ongoing health continues to reflect current observations.',
                        )
                      : l(
                          '此前已确认初始化，当前配置需要处理。',
                          'Setup was previously confirmed; current configuration needs attention.',
                        )
                  }
                />
              )}
            </div>
          </section>
          {!canWrite && (
            <Alert
              type="info"
              title={l(
                '只读模式：可查看进度，保存和完成需要配置写权限。',
                'Read-only: configuration write permission is required to save or finish.',
              )}
            />
          )}
          <Steps
            current={step}
            onChange={setStep}
            items={stages.map((title) => ({ title }))}
            responsive
          />
          {step === 0 && (
            <section className="panel">
              <div className="panel-head">
                <h2>{stages[0]}</h2>
              </div>
              <div className="panel-body admin-stack">
                <p>
                  {l(
                    '选择需要管理的通道。选择不启用通道，也不代表材料已加载。',
                    'Select management channels. Selection does not enable a channel or establish that materials are loaded.',
                  )}
                </p>
                <Checkbox.Group
                  value={[...selection.channels]}
                  disabled={locked}
                  onChange={(values) =>
                    setDraft({
                      ...selection,
                      channels: values as Intent['channels'],
                      completionRequested: false,
                    })
                  }
                  options={channels.map((value) => ({ value, label: setupName(locale, value) }))}
                />
                <h2>{l('可选能力', 'Optional capabilities')}</h2>
                {capabilities.map((key) => {
                  const d = selection.capabilities[key]
                  return (
                    <div className="setup-choice" key={key}>
                      <label htmlFor={`capability-${key}`}>{setupName(locale, key)}</label>
                      <Select
                        id={`capability-${key}`}
                        aria-label={setupName(locale, key)}
                        value={d?.kind ?? ''}
                        disabled={locked}
                        onChange={(value) => decision(key, value)}
                        options={[
                          { value: '', label: l('尚未选择', 'Not selected') },
                          { value: 'configure', label: l('配置', 'Configure') },
                          { value: 'skip', label: l('显式跳过', 'Explicitly skip') },
                        ]}
                      />
                      {d?.kind === 'skip' && (
                        <Input
                          aria-label={`${setupName(locale, key)} ${l('跳过原因', 'Skip reason')}`}
                          placeholder={l('填写跳过原因', 'Enter a skip reason')}
                          maxLength={1024}
                          value={d.reason}
                          disabled={locked}
                          onChange={(e) =>
                            setDraft({
                              ...selection,
                              capabilities: {
                                ...selection.capabilities,
                                [key]: { kind: 'skip', reason: e.target.value },
                              },
                              completionRequested: false,
                            })
                          }
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}
          {step === 1 && (
            <>
              <Alert
                type="info"
                title={l(
                  '在所属模块配置后返回刷新。页面访问、保存登记、材料加载和实际设备效果各自独立。',
                  'Configure in the owning module, return and refresh. Page visits, recorded configuration, material loading and device effects are separate facts.',
                )}
              />
              <Evidence progress={current} locale={locale} />
              <section className="panel">
                <div className="panel-head">
                  <h2>{l('配置入口', 'Configuration entries')}</h2>
                </div>
                <div className="panel-body">
                  <Space wrap>
                    {[
                      ...current.saved.intent.channels,
                      ...Object.keys(current.saved.intent.capabilities),
                    ].map(
                      (key) =>
                        setupDestination(key) && (
                          <Link key={key} to={setupDestination(key)!}>
                            {setupName(locale, key)}
                          </Link>
                        ),
                    )}
                    <Link to="/resources">{l('资源库', 'Resources')}</Link>
                    <Link to="/scopes">{l('范围', 'Scopes')}</Link>
                    <Link to="/policies">{l('策略', 'Policies')}</Link>
                    <Link to="/enroll">{l('实际设备注册', 'Device enrollment')}</Link>
                    <Link to="/certificates">
                      {l('设备 PKI 与签名材料', 'Device PKI and signing materials')}
                    </Link>
                  </Space>
                </div>
              </section>
            </>
          )}
          {step === 2 && (
            <>
              <Evidence progress={current} locale={locale} />
              <Alert
                type={current.canComplete ? 'info' : 'warning'}
                title={l(
                  '完成确认绑定已保存的意图和后端当前观察；后续健康变化仍会显示。',
                  'Completion confirms the saved intent against current server observations. Later health changes remain visible.',
                )}
              />
            </>
          )}
          {dirty && (
            <Alert
              type="warning"
              title={l(
                '有未保存的意图。刷新状态不会覆盖草稿；离开页面会丢弃未提交编辑。',
                'Intent has unsaved changes. Refresh does not overwrite the draft; leaving discards unsubmitted edits.',
              )}
            />
          )}
          <Space wrap>
            <Button
              type="primary"
              disabled={locked || !draft}
              loading={action.busy}
              onClick={() => void save(false)}
            >
              {l('保存意图', 'Save intent')}
            </Button>
            {(dirty || baseRevision !== current.saved.revision) && (
              <Button
                disabled={!!pending || action.busy}
                onClick={() => {
                  setDraft(current.saved.intent)
                  setBaseRevision(current.saved.revision)
                }}
              >
                {l('使用后端当前意图', 'Use current server intent')}
              </Button>
            )}
            {step < 2 ? (
              <Button onClick={() => setStep(step + 1)}>{l('下一步', 'Next')}</Button>
            ) : (
              <Button
                disabled={locked || dirty || !current.canComplete || current.complete}
                onClick={() => setConfirm(true)}
              >
                {l('确认完成初始化', 'Confirm setup completion')}
              </Button>
            )}
          </Space>
        </>
      )}
      {canRead && pending && (
        <Alert
          type="warning"
          title={l('原请求尚未确认', 'Original request is unconfirmed')}
          description={
            <div className="admin-stack">
              <code>{pending.operationId}</code>
              <p>
                {l(
                  '保留原意图和版本。查询未找到不代表没有提交；不会自动重放。',
                  'The original intent and revision are retained. Not found does not prove the write failed. Writes are never automatically replayed.',
                )}
              </p>
              <Space wrap>
                <Button disabled={action.busy} onClick={() => void query()}>
                  {l('查询原操作', 'Query original operation')}
                </Button>
                <Button disabled={action.busy || !canWrite} onClick={() => void execute(pending)}>
                  {l('显式重提原请求', 'Explicitly resubmit original request')}
                </Button>
              </Space>
            </div>
          }
        />
      )}
      {canRead && receipt && (
        <Alert
          type="info"
          title={l(
            '原请求回执已核对；完成与健康以重新读取的进度为准。',
            'The original receipt was checked. Completion and health come from refreshed progress.',
          )}
          description={<code>{receipt}</code>}
        />
      )}
      {canRead && (
        <section className="panel">
          <div className="panel-head">
            <h2>{l('恢复操作与近期认证', 'Operation recovery and recent authentication')}</h2>
          </div>
          <div className="panel-body admin-stack">
            <p>
              {l(
                '刷新或重登录后，可输入原操作标识查询回执。重新认证后仍需显式继续。',
                'After refresh or sign-in, enter the original operation ID to query its receipt. Continue explicitly after reauthentication.',
              )}
            </p>
            <Form layout="inline" onFinish={() => void query()}>
              <Form.Item label={l('原操作标识', 'Original operation ID')}>
                <Input
                  aria-label={l('原操作标识', 'Original operation ID')}
                  value={pending?.operationId ?? lookup}
                  disabled={!!pending}
                  onChange={(e) => setLookup(e.target.value)}
                  autoComplete="off"
                />
              </Form.Item>
              <Button htmlType="submit" disabled={action.busy || (!pending && !lookup)}>
                {l('查询回执', 'Query receipt')}
              </Button>
            </Form>
            <Space wrap>
              {state.identity?.hasLocalPassword && (
                <Button
                  onClick={() => {
                    action.clear()
                    setReauth(true)
                  }}
                >
                  {l('重新认证', 'Reauthenticate')}
                </Button>
              )}
              <Link to="/security">
                {l('安全与认证方式', 'Security and authentication methods')}
              </Link>
            </Space>
          </div>
        </section>
      )}
      <Modal
        open={confirm}
        title={l('确认完成初始化', 'Confirm setup completion')}
        getContainer={false}
        rootClassName={confirm ? 'mdm-overlay-open' : ''}
        onCancel={() => setConfirm(false)}
        onOk={() => void save(true)}
        okButtonProps={{ disabled: locked || dirty || !current?.canComplete }}
        confirmLoading={action.busy}
      >
        <p>
          {l(
            '将提交当前已保存意图的完成确认。服务端将再次检查实际配置。',
            'Submit completion confirmation for the saved intent. The server will check actual configuration again.',
          )}
        </p>
      </Modal>
      <Modal
        open={reauth}
        title={l('重新认证', 'Reauthenticate')}
        getContainer={false}
        rootClassName={reauth ? 'mdm-overlay-open' : ''}
        onCancel={() => {
          setPassword('')
          setReauth(false)
        }}
        footer={null}
        destroyOnHidden
      >
        <Form
          layout="vertical"
          onFinish={() => {
            const secret = password
            setPassword('')
            void action
              .run(() => runtime.owner.reauthenticate(secret))
              .then((result) => {
                if (result.ok) setReauth(false)
              })
          }}
        >
          <Failure error={action.error} locale={locale} />
          <Form.Item label={l('当前密码', 'Current password')}>
            <Input.Password
              aria-label={l('当前密码', 'Current password')}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" disabled={!password} loading={action.busy}>
            {l('确认认证', 'Confirm authentication')}
          </Button>
        </Form>
      </Modal>
    </div>
  )
}
function Evidence({ progress, locale }: { progress: Progress; locale: Locale }) {
  const l = labels(locale)
  return (
    <div className="admin-stack">
      {progress.steps.map((s) => (
        <section className="panel" key={s.id} data-setup-step={s.id}>
          <div className="panel-head">
            <h2>{setupName(locale, s.id)}</h2>
            <SetupStatus locale={locale} value={s.status} />
          </div>
          <div className="panel-body admin-stack">
            {s.reason && <p>{setupName(locale, s.reason)}</p>}
            {s.evidence.map((e) => (
              <div className="setup-evidence" key={e.id}>
                <Space wrap>
                  <strong>{setupName(locale, e.id)}</strong>
                  <SetupStatus locale={locale} value={e.status} />
                </Space>
                <p className="subtitle">
                  {l('登记 / 期望 / 应用版本', 'Recorded / desired / applied revision')}:{' '}
                  {e.revision ?? '—'} / {e.desiredRevision ?? '—'} / {e.appliedRevision ?? '—'}
                </p>
                {e.reason && <p className="subtitle">{setupName(locale, e.reason)}</p>}
              </div>
            ))}
            {setupDestination(s.id) && (
              <Link to={setupDestination(s.id)!}>
                {l('打开所属配置', 'Open configuration owner')} →
              </Link>
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
