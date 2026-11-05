import { useEffect, useRef, useState } from 'react'
import { Button, Drawer, Modal } from 'antd'
import { QueryControls, QueryRows, usePresentation } from '@rss/core'
import {
  validateLogin,
  validateNewPassword,
  type Account,
  type AccountQuery,
  type AccountRow,
} from '@rss/auth-core'
import { useT } from './i18n'
import {
  unresolved,
  useAdministration,
  useIdentity,
  useOperation,
  useSecretCleanup,
} from './runtime'
import { Field, Notice, Secret } from './fields'
import { LocalProfileEditor } from './LocalProfileEditor'

const columns: (keyof AccountRow)[] = [
  'principalId',
  'login',
  'enabled',
  'memberActive',
  'hasLocalPassword',
  'displayName',
  'email',
  'profileStatus',
  'departmentStatus',
  'departmentSnapshot',
]
const initialFields: (keyof AccountRow)[] = [
  'principalId',
  'login',
  'enabled',
  'memberActive',
  'hasLocalPassword',
]
type DirectoryRow = Partial<AccountRow> & Pick<Account, 'principalId'>
export function AccountsPage() {
  const api = useAdministration()
  const { snapshot } = useIdentity()
  const { locale } = usePresentation()
  const zh = locale === 'zh-CN'
  const t = useT()
  const op = useOperation()
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState('')
  const [fields, setFields] = useState<(keyof AccountRow)[]>(initialFields)
  const [source, setSource] = useState('local')
  const [limit, setLimit] = useState(50)
  const applied = useRef<AccountQuery | null>(null)
  const acceptedCursor = useRef<string | undefined>(undefined)
  const [trail, setTrail] = useState<(string | undefined)[]>([])
  const [rows, setRows] = useState<DirectoryRow[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [creating, setCreating] = useState(false)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [detail, setDetail] = useState<Account | null>(null)
  const [profile, setProfile] = useState<Account | null>(null)
  const [resetTarget, setResetTarget] = useState<Account | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [change, setChange] = useState<{
    account: Account
    field: 'enabled' | 'membership'
    enabled: boolean
  } | null>(null)
  function closeCreate() {
    setCreating(false)
    setPassword('')
    setLogin('')
  }
  function closeReset() {
    setResetTarget(null)
    setResetPassword('')
  }
  useSecretCleanup(() => {
    setPassword('')
    setResetPassword('')
  })
  const blocked = unresolved(op.code)
  async function load(cursor?: string, navigatePage = false, checkpoint = op.checkpoint) {
    const selection: AccountQuery =
      navigatePage && applied.current
        ? applied.current
        : {
            ...(filter.trim() ? { filter: filter.trim() } : {}),
            ...(sort.trim() ? { sort: sort.split(',').map((value) => value.trim()) } : {}),
            fields: [...new Set<keyof AccountRow>(['principalId', ...fields])],
            source,
            limit,
          }
    try {
      const value = await api.accounts({ ...selection, ...(cursor ? { cursor } : {}) })
      checkpoint()
      if (value.nextCursor && (value.nextCursor === cursor || trail.includes(value.nextCursor)))
        throw new Error('Repeated account cursor')
      const result = value.items.map((row) => {
        if (!row.principalId) throw new Error('Missing principal locator')
        return { ...row, principalId: row.principalId }
      })
      const position = trail.lastIndexOf(cursor)
      setTrail(
        cursor === undefined
          ? []
          : cursor === acceptedCursor.current
            ? trail
            : position >= 0
              ? trail.slice(0, position)
              : [...trail, acceptedCursor.current],
      )
      applied.current = selection
      acceptedCursor.current = cursor
      setRows(result)
      setNext(value.nextCursor)
      setLoaded(true)
    } catch (failure) {
      checkpoint()
      setRows([])
      setNext(null)
      throw failure
    }
  }
  useEffect(() => {
    void op.run((checkpoint) => load(undefined, false, checkpoint))
  }, [])
  function readDetail(principal: string) {
    void op.run(async (checkpoint) => {
      const account = await api.account(principal)
      checkpoint()
      setDetail(account)
    })
  }
  function openChange(field: 'enabled' | 'membership') {
    if (!detail) return
    const id = detail.principalId
    void op.run(async (checkpoint) => {
      const account = await api.account(id)
      checkpoint()
      setChange({
        account,
        field,
        enabled: !(field === 'enabled' ? account.enabled : account.memberActive),
      })
    })
  }
  function create() {
    const secret = password
    setPassword('')
    try {
      validateLogin(login)
      validateNewPassword(secret)
    } catch {
      op.setCode('invalid_request')
      return
    }
    void op.run(async (checkpoint) => {
      await api.createAccount(login, secret)
      checkpoint()
      closeCreate()
      await load(undefined, false, checkpoint)
    })
  }
  function confirmChange() {
    const pending = change
    setChange(null)
    if (!pending) return
    void op.run(async (checkpoint) => {
      const account = await api.setAccount(
        pending.account.principalId,
        pending.field,
        pending.enabled,
      )
      checkpoint()
      setDetail(account)
      if (snapshot.status === 'authenticated') await load(undefined, false, checkpoint)
    })
  }
  function reset() {
    const target = resetTarget,
      secret = resetPassword
    closeReset()
    if (!target) return
    try {
      validateNewPassword(secret)
    } catch {
      op.setCode('invalid_request')
      return
    }
    void op.run(async (checkpoint) => {
      await api.resetPassword(target.principalId, secret)
      checkpoint()
      await load(undefined, false, checkpoint)
    })
  }
  return (
    <section className="auth-page">
      <h1>{t('accounts')}</h1>
      <Notice error={op.error} />
      <Field
        id="account-source"
        label={zh ? '资料来源（local 或指定 IdP UUID）' : 'Profile source (local or IdP UUID)'}
        value={source}
        onChange={(event) => setSource(event.target.value)}
        disabled={op.busy}
      />
      <QueryControls
        filter={filter}
        sort={sort}
        fields={fields}
        columns={columns}
        limit={limit}
        maximum={100}
        previous={trail.length > 0}
        next={!!next}
        disabled={op.busy}
        labels={{
          filter: zh ? '筛选表达式' : 'Filter expression',
          sort: zh ? '排序（逗号分隔，- 降序）' : 'Sort (comma separated, - descending)',
          fields: zh ? '返回字段' : 'Returned fields',
          limit: t('pageSize'),
          apply: t('apply'),
          first: t('first'),
          previous: t('previous'),
          next: t('next'),
        }}
        hint={
          zh
            ? '服务端筛选：principalId、login、enabled、memberActive、hasLocalPassword、displayName、email、profileStatus。姓名和邮箱来自指定来源。支持 == != =lt= =le= =gt= =ge= =in= =out= =icontains= =isnull= =isnotnull=；布尔仅支持 == != =in= =out=。部门条件 department / departmentSubtree == 部门 ID，须指定 IdP。'
            : 'Server fields: principalId, login, enabled, memberActive, hasLocalPassword, displayName, email, profileStatus. Name/email use the selected source. Operators: == != =lt= =le= =gt= =ge= =in= =out= =icontains= =isnull= =isnotnull=; booleans: == != =in= =out=. Department conditions: department / departmentSubtree == department ID; select an IdP.'
        }
        onFilter={setFilter}
        onSort={setSort}
        onFields={(values) =>
          setFields(
            values.filter((value): value is keyof AccountRow =>
              columns.includes(value as keyof AccountRow),
            ),
          )
        }
        onLimit={setLimit}
        onApply={() => {
          void op.run((checkpoint) => load(undefined, false, checkpoint))
        }}
        onFirst={() => {
          void op.run((checkpoint) => load(undefined, true, checkpoint))
        }}
        onPrevious={() => {
          void op.run((checkpoint) => load(trail.at(-1), true, checkpoint))
        }}
        onNext={() => {
          void op.run((checkpoint) => load(next ?? undefined, true, checkpoint))
        }}
      />
      <div className="auth-actions">
        <Button
          disabled={op.busy}
          onClick={() => {
            void op.run((checkpoint) => load(undefined, false, checkpoint))
          }}
        >
          {t(loaded ? 'reload' : 'loadList')}
        </Button>
        <Button type="primary" disabled={op.busy || blocked} onClick={() => setCreating(true)}>
          {t('createAccount')}
        </Button>
      </div>
      {!loaded && <p role="status">{t('listNotLoaded')}</p>}
      {loaded && (
        <QueryRows
          items={rows}
          required={['principalId']}
          disabled={op.busy}
          onOpen={(row) => {
            if (typeof row['principalId'] === 'string') readDetail(row['principalId'])
          }}
        />
      )}
      <Drawer
        open={creating}
        title={t('createAccount')}
        footer={null}
        onClose={closeCreate}
        destroyOnHidden
        maskClosable={!op.busy}
        closable={!op.busy}
      >
        <Notice error={op.error} />
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault()
            create()
          }}
        >
          <Field
            id="account-login"
            label={t('username')}
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            autoComplete="off"
            maxLength={128}
            required
            disabled={op.busy || blocked}
          />
          <Secret
            id="account-password"
            label={t('password')}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={15}
            required
            disabled={op.busy || blocked}
          />
          <Button htmlType="submit" type="primary" disabled={op.busy || blocked}>
            {t('create')}
          </Button>
        </form>
      </Drawer>
      <Modal
        open={detail !== null}
        title={t('account')}
        footer={null}
        onCancel={() => setDetail(null)}
        destroyOnHidden
        width={720}
      >
        {detail && (
          <div className="auth-page">
            <Notice error={op.error} />
            <dl>
              <dt>{t('account')}</dt>
              <dd>{detail.login ?? '—'}</dd>
              <dt>{t('principalId')}</dt>
              <dd>{detail.principalId}</dd>
              <dt>{t('state')}</dt>
              <dd>
                {t(detail.enabled ? 'enabled' : 'disabled')} ·{' '}
                {t(detail.memberActive ? 'memberActive' : 'memberInactive')}
              </dd>
            </dl>
            <div className="auth-actions">
              <Button disabled={op.busy} onClick={() => readDetail(detail.principalId)}>
                {t('reload')}
              </Button>
              <Button
                disabled={op.busy}
                onClick={() => {
                  setProfile(detail)
                  setDetail(null)
                }}
              >
                {t('localProfile')}
              </Button>
              <Button disabled={op.busy || blocked} onClick={() => openChange('enabled')}>
                {t(detail.enabled ? 'disable' : 'enable')}
              </Button>
              <Button disabled={op.busy || blocked} onClick={() => openChange('membership')}>
                {t(detail.memberActive ? 'disableMember' : 'enableMember')}
              </Button>
              {detail.hasLocalPassword && detail.principalId !== snapshot.identity?.principalId && (
                <Button
                  disabled={op.busy || blocked}
                  onClick={() => {
                    const id = detail.principalId
                    void op.run(async (checkpoint) => {
                      const account = await api.account(id)
                      checkpoint()
                      if (account.hasLocalPassword) {
                        setResetPassword('')
                        setResetTarget(account)
                        setDetail(null)
                      }
                    })
                  }}
                >
                  {t('resetPassword')}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={change !== null}
        title={t('confirmChange')}
        okText={t('confirm')}
        cancelText={t('cancel')}
        onCancel={() => setChange(null)}
        onOk={confirmChange}
        confirmLoading={op.busy}
        destroyOnHidden
      >
        <p>{change?.account.login ?? change?.account.principalId}</p>
        <p>{t('changeHelp')}</p>
      </Modal>
      <Modal
        open={resetTarget !== null}
        title={t('resetPassword')}
        footer={null}
        onCancel={closeReset}
        destroyOnHidden
      >
        <p>{resetTarget?.login ?? resetTarget?.principalId}</p>
        <p>{t('resetHelp')}</p>
        <Notice error={op.error} />
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault()
            reset()
          }}
        >
          <Secret
            id="reset-password"
            label={t('newPassword')}
            value={resetPassword}
            onChange={(event) => setResetPassword(event.target.value)}
            autoComplete="new-password"
            minLength={15}
            required
            disabled={op.busy || blocked}
          />
          <Button htmlType="submit" disabled={op.busy || blocked}>
            {t('resetPassword')}
          </Button>
        </form>
      </Modal>
      <Drawer
        open={profile !== null}
        title={t('localProfile')}
        footer={null}
        onClose={() => setProfile(null)}
        destroyOnHidden
        size="large"
      >
        {profile && (
          <LocalProfileEditor key={profile.principalId} principal={profile.principalId} />
        )}
      </Drawer>
    </section>
  )
}
