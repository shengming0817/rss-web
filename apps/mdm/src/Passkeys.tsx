import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Alert, Button, Form, Input, Space } from 'antd'
import type { Passkey } from '@rss/auth-http'
import type { Runtime } from './runtime'
import { messages, type Locale } from './i18n'

export function Passkeys({
  runtime,
  locale,
  busy,
  run,
}: {
  runtime: Runtime
  locale: Locale
  busy: boolean
  run: (work: () => Promise<unknown>) => Promise<void>
}) {
  const t = messages(locale),
    state = useSyncExternalStore(runtime.owner.subscribe, runtime.owner.getSnapshot)
  const [keys, setKeys] = useState<Passkey[]>(),
    [authorized, setAuthorized] = useState<number | null>(null)
  const [form] = Form.useForm<{ label: string }>()
  const active = useRef(true),
    prompt = useRef<AbortController | null>(null)
  useEffect(() => {
    if (authorized === null) return
    const timer = setTimeout(() => setAuthorized(null), Math.max(0, authorized * 1000 - Date.now()))
    return () => clearTimeout(timer)
  }, [authorized])
  function scope() {
    const snapshot = runtime.owner.getSnapshot()
    return snapshot.status === 'authenticated'
      ? `${snapshot.tenant}/${snapshot.identity?.principalId}/${snapshot.session?.id}`
      : null
  }
  async function read() {
    const value = await runtime.passkeys.list()
    if (active.current) setKeys(value)
  }
  useEffect(() => {
    active.current = true
    void run(async () => {
      await read()
      if (runtime.oidcEnabled) await runtime.owner.loadSecurity()
    })
    return () => {
      active.current = false
      prompt.current?.abort()
      form.resetFields()
    }
  }, [runtime, form])
  function perform(kind: 'register' | 'authorize', label = '') {
    void run(async () => {
      const bound = scope()
      if (!bound) throw new Error('Session required')
      const controller = new AbortController()
      prompt.current = controller
      let ceremony: string | undefined,
        dispatched = false,
        timer: ReturnType<typeof setTimeout> | undefined
      try {
        if (kind === 'register') setAuthorized(null)
        const challenge =
          kind === 'register'
            ? await runtime.passkeys.beginRegistration(label)
            : await runtime.passkeys.beginRegistrationAuthorization()
        ceremony = challenge.id
        if (scope() !== bound || !active.current || controller.signal.aborted)
          throw new DOMException('Cancelled', 'AbortError')
        const remaining = challenge.expiresAt * 1000 - Date.now()
        if (remaining <= 0) throw new DOMException('Expired', 'AbortError')
        timer = setTimeout(() => controller.abort(), Math.min(remaining, 2_147_483_647))
        const credential =
          kind === 'register'
            ? await navigator.credentials.create({
                publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(
                  challenge.publicKey as PublicKeyCredentialCreationOptionsJSON,
                ),
                signal: controller.signal,
              })
            : await navigator.credentials.get({
                publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(
                  challenge.publicKey as PublicKeyCredentialRequestOptionsJSON,
                ),
                signal: controller.signal,
              })
        if (
          !(credential instanceof PublicKeyCredential) ||
          controller.signal.aborted ||
          scope() !== bound ||
          !active.current
        )
          throw new DOMException('Cancelled', 'AbortError')
        dispatched = true
        if (kind === 'register') {
          await runtime.passkeys.finishRegistration(ceremony, credential.toJSON())
          form.resetFields()
          setAuthorized(null)
          await read()
        } else {
          const expiresAt = await runtime.passkeys.finishRegistrationAuthorization(
            ceremony,
            credential.toJSON(),
          )
          if (active.current && expiresAt * 1000 > Date.now()) setAuthorized(expiresAt)
        }
      } catch (error) {
        // Never cancel/retry a finish whose commit outcome is unknown. Its authority is read again.
        if (ceremony && !dispatched && scope() === bound)
          await runtime.passkeys.cancelCeremony(ceremony)
        if (error instanceof DOMException && ['AbortError', 'NotAllowedError'].includes(error.name))
          throw { code: 'authentication_cancelled' }
        if (error instanceof DOMException && error.name === 'InvalidStateError')
          throw { code: 'authenticator_already_registered' }
        throw error
      } finally {
        clearTimeout(timer)
        if (prompt.current === controller) prompt.current = null
      }
    })
  }
  const supported =
    typeof PublicKeyCredential !== 'undefined' &&
    typeof PublicKeyCredential.parseCreationOptionsFromJSON === 'function' &&
    typeof PublicKeyCredential.parseRequestOptionsFromJSON === 'function' &&
    typeof PublicKeyCredential.prototype.toJSON === 'function'
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{t.passkeys}</h2>
        <Button disabled={busy} onClick={() => void run(read)}>
          {t.readPasskeys}
        </Button>
      </div>
      <div className="panel-body">
        {!supported && <Alert type="warning" title={t.passkeysUnsupported} />}
        {keys === undefined ? (
          <p>{t.passkeysUnread}</p>
        ) : (
          <>
            {keys.length === 0 ? (
              <p>{t.noPasskeys}</p>
            ) : (
              <ul className="passkey-list">
                {keys.map((key) => (
                  <li key={key.id}>{key.label}</li>
                ))}
              </ul>
            )}
            <p className="subtitle">{t.passkeyPurpose}</p>
            {authorized && <Alert type="success" title={t.passkeyAuthorized} />}
            <Space wrap className="passkey-actions">
              {keys.length > 0 && (
                <Button disabled={busy || !supported} onClick={() => perform('authorize')}>
                  {t.authorizePasskey}
                </Button>
              )}
              {state.security?.eligibleStepUpProviders.map((provider) => (
                <Button
                  disabled={busy}
                  key={provider.id}
                  onClick={() =>
                    void run(async () => {
                      runtime.flows.save('step-up', runtime.tenant)
                      try {
                        window.location.assign(
                          await runtime.owner.stepUp(provider.id, { kind: 'register' }),
                        )
                      } catch (error) {
                        runtime.flows.clear()
                        throw error
                      }
                    })
                  }
                >
                  {t.authorizeWithProvider} · {provider.label}
                </Button>
              ))}
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await runtime.passkeys.cancelAuthorization()
                    setAuthorized(null)
                  })
                }
              >
                {t.cancelAuthorization}
              </Button>
              {busy && prompt.current && (
                <Button onClick={() => prompt.current?.abort()}>{t.cancel}</Button>
              )}
            </Space>
            <Form
              form={form}
              layout="vertical"
              onFinish={(value) => perform('register', value.label)}
            >
              <Form.Item
                name="label"
                label={t.passkeyLabel}
                rules={[
                  { required: true, message: t.passkeyLabel },
                  {
                    validator: (_, value: unknown) =>
                      typeof value === 'string' && new TextEncoder().encode(value).length <= 128
                        ? Promise.resolve()
                        : Promise.reject(new Error(t.passkeyLabelBudget)),
                  },
                ]}
              >
                <Input autoComplete="off" maxLength={128} disabled={busy} />
              </Form.Item>
              <Button type="primary" htmlType="submit" disabled={busy || !supported}>
                {t.addPasskey}
              </Button>
            </Form>
          </>
        )}
      </div>
    </section>
  )
}
