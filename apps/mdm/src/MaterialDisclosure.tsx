import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Alert, Button, Card, Input, Space } from 'antd'
import { freeze, uuid } from '@rss/mdm-inventory'
import type { MaterialDisclosureContext } from '@rss/auth-core'
import type {
  LoginDisclosure,
  MaterialRef,
  RecoveryCredentials,
} from '@rss/mdm-recovery-credentials'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, useAction, validateInput } from './AdminUi'
import { Status, timestamp } from './DevicePresentation'
import { usePendingSelection } from './SelectionGuard'
import { useProtectedDelivery } from './useProtectedDelivery'
function context(input: LoginDisclosure): MaterialDisclosureContext {
  return {
    purpose: 'mdm.device_access.disclose',
    device: input.target.device,
    material: input.target.id,
    version: input.target.version,
    operationId: input.operationId,
  }
}
function supportsAuthenticator() {
  return (
    typeof PublicKeyCredential !== 'undefined' &&
    typeof PublicKeyCredential.parseRequestOptionsFromJSON === 'function' &&
    typeof PublicKeyCredential.prototype.toJSON === 'function'
  )
}
export function MaterialDisclosure({
  runtime,
  credentials,
  target,
  rssLogin,
  permitted,
  locale,
}: {
  runtime: Runtime
  credentials: RecoveryCredentials
  target: MaterialRef
  rssLogin: boolean
  permitted: boolean
  locale: Locale
}) {
  const l = labels(locale),
    authorization = runtime.materialAuthorization,
    state = useSyncExternalStore(authorization.subscribe, authorization.getSnapshot),
    action = useAction(),
    [original, setOriginal] = useState<LoginDisclosure | null>(null),
    originalNow = useRef<LoginDisclosure | null>(null),
    [sent, setSent] = useState(false),
    [unknown, setUnknown] = useState(false),
    [secret, setSecret] = useState<string | null>(null),
    [until, setUntil] = useState<number | null>(null),
    [expired, setExpired] = useState(false),
    [cleanupUnknown, setCleanupUnknown] = useState(false),
    [restoreId, setRestoreId] = useState(''),
    transfer = useRef<AbortController | null>(null),
    delivery = useProtectedDelivery(clearOwned, permitted)
  usePendingSelection(!!original || action.busy || secret !== null)
  const owns =
      original !== null &&
      state.context?.operationId === original.operationId &&
      state.context.device === target.device &&
      state.context.material === target.id &&
      state.context.version === target.version,
    deadline = owns && state.expiresAt !== null ? state.expiresAt : until
  function clearOwned() {
    transfer.current?.abort()
    setSecret(null)
    setUntil(null)
    const current = originalNow.current
    if (
      current &&
      authorization.getSnapshot().context?.operationId === current.operationId &&
      authorization.getSnapshot().context?.device === current.target.device &&
      authorization.getSnapshot().context?.material === current.target.id &&
      authorization.getSnapshot().context?.version === current.target.version
    )
      void authorization.cancel().catch(() => setCleanupUnknown(true))
  }
  function clear() {
    delivery.clear()
    clearOwned()
  }
  useEffect(() => {
    if (deadline === null) return
    const timer = setTimeout(
      () => {
        authorization.expire()
        delivery.clear()
        transfer.current?.abort()
        setSecret(null)
        setExpired(true)
      },
      Math.max(0, Math.min(2147483647, deadline * 1000 - Date.now())),
    )
    return () => clearTimeout(timer)
  }, [deadline, authorization])
  function originalInput(): LoginDisclosure {
    const input =
      originalNow.current ??
      freeze({
        operationId: crypto.randomUUID(),
        target: { device: target.device, id: target.id, version: target.version },
      })
    originalNow.current = input
    setOriginal(input)
    return input
  }
  function authorize() {
    const epoch = delivery.capture()
    void action.run(async () => {
      if (!permitted || !delivery.isCurrent(epoch) || !supportsAuthenticator())
        throw { cause: 'client', code: 'authentication_unavailable' }
      const input = originalInput()
      setExpired(false)
      setCleanupUnknown(false)
      await runtime.authorizeMaterial(
        context(input),
        (signal) => credentials.beginLoginDisclosure(input, signal),
        async (options, signal) => {
          const credential = await navigator.credentials.get({
            publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(
              options as unknown as PublicKeyCredentialRequestOptionsJSON,
            ),
            signal,
          })
          if (
            !(credential instanceof PublicKeyCredential) ||
            signal.aborted ||
            !delivery.isCurrent(epoch)
          )
            throw new DOMException('Cancelled', 'AbortError')
          return credential.toJSON()
        },
      )
    })
  }
  async function reveal(recover = false, inputOverride?: LoginDisclosure) {
    setSecret(null)
    const epoch = delivery.capture(),
      controller = new AbortController()
    transfer.current = controller
    await action.run(async () => {
      if (!permitted || !delivery.isCurrent(epoch)) return
      const input = rssLogin ? (inputOverride ?? originalNow.current) : null
      if (rssLogin && !input) throw { cause: 'client', code: 'authentication_required' }
      if (input && !recover) {
        const expiresAt = authorization.getSnapshot().expiresAt
        try {
          authorization.consume(context(input))
        } catch {
          throw { cause: 'client', code: 'authentication_expired' }
        }
        setUntil(expiresAt)
      }
      if (input) setSent(true)
      try {
        const value = input
          ? await credentials.revealLogin(input, controller.signal)
          : await credentials.reveal(target, controller.signal)
        if (delivery.isCurrent(epoch) && !controller.signal.aborted) {
          setSecret(value.secret)
          setUnknown(false)
        } else if (input) setUnknown(true)
      } catch (error) {
        if (input) setUnknown((previous) => previous || isUnknown(error))
        throw error
      }
    })
    if (transfer.current === controller) transfer.current = null
  }
  async function finish() {
    delivery.clear()
    transfer.current?.abort()
    setSecret(null)
    setUntil(null)
    const result = await action.run(async () => {
      if (owns) await authorization.cancel()
    })
    if (result.ok) {
      originalNow.current = null
      setOriginal(null)
      setSent(false)
      setUnknown(false)
      setExpired(false)
      setCleanupUnknown(false)
      setRestoreId('')
    }
  }
  const authorized = owns && state.status === 'authorized' && !expired,
    blocked = action.busy || !permitted
  return (
    <Card
      title={
        rssLogin
          ? l('RSS Login 恢复材料披露', 'RSS Login recovery material disclosure')
          : l('恢复凭据披露', 'Recovery credential disclosure')
      }
    >
      <p className="mono">
        {target.device} · {target.id} · {target.version}
      </p>
      <Alert
        type="warning"
        title={l(
          '秘密只在此面板短暂显示。关闭、隐藏、离开、权限或会话变化时清除，不会写入地址、浏览器存储或日志。',
          'Secrets are shown only in this panel. They are cleared on closing, hiding, leaving, permission or session changes and are never written to URLs, browser storage or logs.',
        )}
      />
      {rssLogin && (
        <>
          <p>
            {l(
              '服务端将此设备、材料版本、主体、会话及操作绑定到 mdm.device_access.disclose；验证不会自动披露秘密。',
              'The server binds this device, material version, principal, session and operation to mdm.device_access.disclose. Authorization never discloses the secret automatically.',
            )}
          </p>
          {!supportsAuthenticator() && (
            <Alert
              type="info"
              title={l(
                '当前浏览器不支持所需的用途验证接口。',
                'This browser does not support the required purpose authorization API.',
              )}
            />
          )}
          {owns && (
            <p>
              {l('用途认证状态', 'Purpose authorization state')} ·{' '}
              <Status value={state.status} locale={locale} />
              {state.expiresAt !== null && ` · ${timestamp(locale, state.expiresAt)}`}
            </p>
          )}
          <Button
            disabled={blocked || !supportsAuthenticator() || authorized || unknown}
            onClick={authorize}
          >
            {l('验证此精确披露用途', 'Authorize this exact disclosure purpose')}
          </Button>
        </>
      )}
      <Space wrap>
        <Button
          type="primary"
          disabled={blocked || (rssLogin && !authorized)}
          onClick={() => void reveal()}
        >
          {l('披露此精确材料', 'Disclose this exact material')}
        </Button>
        <Button onClick={clear}>
          {l('清除秘密并取消本地等待', 'Clear secret and stop local waiting')}
        </Button>
        {rssLogin && (
          <Button
            disabled={action.busy && state.status === 'unknown'}
            onClick={() => {
              delivery.clear()
              clearOwned()
            }}
          >
            {l('取消用途认证', 'Cancel purpose authorization')}
          </Button>
        )}
      </Space>
      <Failure error={action.error} locale={locale} />
      {expired && (
        <Alert
          type="info"
          title={l(
            '用途认证已到期，本地秘密已清除。',
            'Purpose authorization expired; the local secret was cleared.',
          )}
        />
      )}
      {cleanupUnknown && (
        <Alert
          type="warning"
          title={l(
            '服务端取消尚未确认。请显式重试取消后再开始认证。',
            'Server cancellation is unconfirmed. Explicitly retry cancellation before starting authorization.',
          )}
        />
      )}
      {original && (
        <>
          <p className="mono">
            {l('原披露操作', 'Original disclosure operation')} · {original.operationId}
          </p>
          {sent && (
            <p>
              {unknown
                ? l(
                    '原披露结果未知，取消本地等待不代表服务端未提交。',
                    'The original disclosure outcome is unknown. Stopping local waiting does not prove that the server did not commit.',
                  )
                : l(
                    '原操作与当前显示内容分别保留。',
                    'The original operation and currently displayed content are separate facts.',
                  )}
            </p>
          )}
          <Space wrap>
            {sent && (
              <Button disabled={blocked} onClick={() => void reveal(true)}>
                {l('显式恢复原披露', 'Explicitly recover original disclosure')}
              </Button>
            )}
            {!unknown && (
              <Button disabled={action.busy} onClick={() => void finish()}>
                {l('结束本次披露', 'Finish this disclosure')}
              </Button>
            )}
          </Space>
        </>
      )}
      {rssLogin && !original && (
        <details>
          <summary>{l('恢复已有披露操作', 'Recover an existing disclosure operation')}</summary>
          <Space wrap>
            <Input
              aria-label={l('已有披露 UUID', 'Existing disclosure UUID')}
              value={restoreId}
              onChange={(event) => setRestoreId(event.target.value)}
              autoComplete="off"
              disabled={blocked}
            />
            <Button
              disabled={blocked || !restoreId}
              onClick={() => {
                const epoch = delivery.capture()
                void action
                  .run(async () => {
                    validateInput(() => uuid(restoreId))
                    const input = freeze({
                      operationId: restoreId,
                      target: { device: target.device, id: target.id, version: target.version },
                    })
                    originalNow.current = input
                    setOriginal(input)
                    setSent(true)
                    setUnknown(true)
                    return input
                  })
                  .then((result) => {
                    if (result.ok && delivery.isCurrent(epoch)) void reveal(true, result.value)
                  })
              }}
            >
              {l('使用该 UUID 显式恢复披露', 'Explicitly recover disclosure using this UUID')}
            </Button>
          </Space>
        </details>
      )}
      {secret !== null && (
        <div className="disclosed-material">
          <p>{l('当前披露内容（敏感）', 'Current disclosed content (sensitive)')}</p>
          <pre role="region" aria-label={l('恢复凭据秘密', 'Recovery credential secret')}>
            {secret}
          </pre>
        </div>
      )}
    </Card>
  )
}
