import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Input, InputNumber } from 'antd'
import { isRssApiError } from '@rss/api/identity'
import {
  profileExtensions,
  validateLocalProfile,
  type LocalProfile,
  type LocalProfileChange,
  type LocalProfileDetail,
  type LocalProfileReceipt,
} from '@rss/auth-core'
import { useT } from './i18n'
import { useAdministration, useOperation, useSecretCleanup } from './runtime'
import { Field, Notice } from './fields'

export function LocalProfileEditor({ principal }: { principal: string }) {
  const api = useAdministration()
  const op = useOperation()
  const t = useT()
  const [revision, setRevision] = useState<number | null>(null)
  const [display, setDisplay] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [missing, setMissing] = useState({ display: true, username: true, email: true })
  const [extensions, setExtensions] = useState('{}')
  const [age, setAge] = useState(14400)
  const [pending, setPending] = useState<{ id: string; state: 'unknown' | 'conflict' } | null>(null)
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const [compared, setCompared] = useState(false)
  function clearDraft() {
    setDisplay('')
    setUsername('')
    setEmail('')
    setExtensions('{}')
    setMissing({ display: true, username: true, email: true })
  }
  useSecretCleanup(() => {
    clearDraft()
    setRevision(null)
  })
  async function load(checkpoint = op.checkpoint) {
    let value: LocalProfileDetail
    try {
      value = await api.localProfile(principal)
    } catch (failure) {
      checkpoint()
      if (isRssApiError(failure) && (failure.status === 401 || failure.status === 403)) {
        setRevision(null)
        clearDraft()
        setPending(null)
        pendingRef.current = null
      }
      throw failure
    }
    checkpoint()
    setRevision(value.revision)
    setDisplay(value.value?.displayName ?? '')
    setUsername(value.value?.username ?? '')
    setEmail(value.value?.email ?? '')
    setMissing({
      display: value.value?.displayName == null,
      username: value.value?.username == null,
      email: value.value?.email == null,
    })
    setExtensions(JSON.stringify(value.value?.extensions ?? {}, null, 2))
    setAge(value.value?.maxAgeSeconds ?? 14400)
    if (pendingRef.current) setCompared(true)
  }
  useEffect(() => {
    void op.run((checkpoint) => load(checkpoint))
  }, [])
  function save(remove = false) {
    if (op.busy || pendingRef.current || revision === null) return
    let value: LocalProfile | null
    try {
      value = remove
        ? null
        : {
            displayName: missing.display ? null : display,
            username: missing.username ? null : username,
            email: missing.email ? null : email,
            extensions: profileExtensions(JSON.parse(extensions)),
            maxAgeSeconds: age,
          }
      if (value) validateLocalProfile(value)
    } catch {
      op.setCode('invalid_request')
      return
    }
    const change: LocalProfileChange = {
      operationId: crypto.randomUUID(),
      expectedRevision: revision,
      value,
    }
    setCompared(false)
    pendingRef.current = { id: change.operationId, state: 'unknown' }
    setPending(pendingRef.current)
    clearDraft()
    void op.run(async (checkpoint) => {
      try {
        await api.saveLocalProfile(principal, change)
        checkpoint()
        setPending(null)
        pendingRef.current = null
      } catch (failure) {
        checkpoint()
        if (isRssApiError(failure) && (failure.status === 401 || failure.status === 403)) {
          setRevision(null)
          clearDraft()
        }
        if (isRssApiError(failure) && failure.cause === 'wire' && failure.status === 409)
          setPending({ id: change.operationId, state: 'conflict' })
        else if (
          isRssApiError(failure) &&
          failure.cause === 'wire' &&
          failure.status !== undefined &&
          failure.status < 500
        ) {
          setPending(null)
          pendingRef.current = null
          setRevision(null)
        }
        throw failure
      }
      await load(checkpoint)
    })
  }
  function receipt() {
    if (!pending) return
    const id = pending.id
    void op.run(async (checkpoint) => {
      let result: LocalProfileReceipt | null
      try {
        result = await api.localProfileOperation(principal, id)
      } catch (failure) {
        checkpoint()
        if (isRssApiError(failure) && (failure.status === 401 || failure.status === 403)) {
          setRevision(null)
          clearDraft()
          setPending(null)
          pendingRef.current = null
        }
        throw failure
      }
      checkpoint()
      if (!result) {
        op.setCode('profile_receipt_missing')
        return
      }
      setPending(null)
      pendingRef.current = null
      await load(checkpoint)
    })
  }
  const disabled = op.busy || !!pending
  return (
    <section className="auth-form">
      <p>{t('localProfileHelp')}</p>
      <Notice error={op.error} />
      {pending && (
        <p role="status">
          {t('profilePending')} <code>{pending.id}</code>
        </p>
      )}
      <div className="auth-actions">
        <Button
          disabled={op.busy}
          onClick={() => {
            void op.run((checkpoint) => load(checkpoint))
          }}
        >
          {t('reload')}
        </Button>
        {pending && (
          <Button disabled={op.busy} onClick={receipt}>
            {t('profileReceipt')}
          </Button>
        )}
      </div>
      {pending && compared && (
        <>
          <p>{t('profileComparedHelp')}</p>
          <Button
            disabled={op.busy}
            onClick={() => {
              setPending(null)
              pendingRef.current = null
              setCompared(false)
              op.setCode('')
            }}
          >
            {t('profileResume')}
          </Button>
        </>
      )}
      {revision !== null && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
          className="auth-form"
        >
          <p>
            {t('revision')}: {revision}
          </p>
          <Field
            id="local-display"
            label={t('profileDisplayName')}
            value={display}
            maxLength={2048}
            disabled={disabled}
            onChange={(event) => {
              setDisplay(event.target.value)
              setMissing({ ...missing, display: false })
            }}
          />
          <Checkbox
            id="local-display-missing"
            checked={missing.display}
            disabled={disabled}
            onChange={(event) => setMissing({ ...missing, display: event.target.checked })}
          >
            {t('profileNotProvided')}
          </Checkbox>
          <Field
            id="local-username"
            label={t('username')}
            value={username}
            maxLength={2048}
            disabled={disabled}
            onChange={(event) => {
              setUsername(event.target.value)
              setMissing({ ...missing, username: false })
            }}
          />
          <Checkbox
            id="local-username-missing"
            checked={missing.username}
            disabled={disabled}
            onChange={(event) => setMissing({ ...missing, username: event.target.checked })}
          >
            {t('profileNotProvided')}
          </Checkbox>
          <Field
            id="local-email"
            label={t('profileEmail')}
            value={email}
            type="email"
            maxLength={2048}
            disabled={disabled}
            onChange={(event) => {
              setEmail(event.target.value)
              setMissing({ ...missing, email: false })
            }}
          />
          <Checkbox
            id="local-email-missing"
            checked={missing.email}
            disabled={disabled}
            onChange={(event) => setMissing({ ...missing, email: event.target.checked })}
          >
            {t('profileNotProvided')}
          </Checkbox>
          <label htmlFor="local-extensions">{t('profileExtensions')}</label>
          <Input.TextArea
            id="local-extensions"
            value={extensions}
            rows={8}
            disabled={disabled}
            onChange={(event) => setExtensions(event.target.value)}
          />
          <label htmlFor="local-profile-age">{t('profileAge')}</label>
          <InputNumber
            id="local-profile-age"
            min={60}
            max={86400}
            value={age}
            disabled={disabled}
            onChange={(value) => setAge(value ?? 0)}
          />
          <div className="auth-actions">
            <Button htmlType="submit" disabled={disabled}>
              {t('save')}
            </Button>
            <Button disabled={disabled} onClick={() => save(true)}>
              {t('profileDelete')}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
