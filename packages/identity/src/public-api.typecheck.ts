import { parseRoleId } from './index'
import type {
  AccountStatusApi,
  IdentityApi,
  IdentitySession,
  LoginResponse,
  RefreshResponse,
  PasswordChangeRequest,
  VerifiedProfile,
  RolesApi,
  PoliciesApi,
  PoliciesCallOptions,
  PolicyView,
} from './index'

declare const api: IdentityApi
declare const login: LoginResponse
declare const refresh: RefreshResponse

void login.data.sessionId
void login.data.expiresAt

// @ts-expect-error Refresh is token rotation, not a complete login session.
void refresh.data.sessionId
// @ts-expect-error Refresh does not extend the login session expiry field.
void refresh.data.expiresAt
// @ts-expect-error Identity adapters do not accept browser-authored authority headers.
void api.profile({ headers: { Authorization: 'fixture' } })

declare const session: IdentitySession
declare const passwordChange: PasswordChangeRequest
declare const verified: VerifiedProfile
void verified.subject
void session.transport
void session.changePassword(passwordChange)
declare const accountStatus: AccountStatusApi
void accountStatus.get('f47ac10b-58cc-4372-a567-0e02b2c3d479')
void session.invalidateForAccountStatusChange('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'locked')
declare const roles: RolesApi
const roleId = parseRoleId('ops:admin')!
void roles.list({ limit: 50 })
void roles.assign(roleId, { subject: 'target@example.test' })
void roles.revoke(roleId, 'target@example.test')
declare const policies: PoliciesApi
declare const policy: PolicyView
void policies.list({ limit: 50 })
void policies.get(policy.policyId)
void policies.create({
  policyId: policy.policyId,
  contractId: policy.contractId,
  permission: policy.permission,
  effectiveFrom: policy.effectiveFrom,
  rules: policy.rules,
})
void policies.update(policy.policyId, {
  expectedVersion: policy.version,
  contractId: policy.contractId,
  permission: policy.permission,
  effectiveFrom: policy.effectiveFrom,
  rules: policy.rules,
})
void policies.deactivate(policy.policyId, { expectedVersion: policy.version })
// @ts-expect-error Policies reads do not accept browser-authored authority headers.
void policies.list(undefined, { headers: { Authorization: 'x' } })
// @ts-expect-error Policies writes do not accept browser-authored authority headers.
const forgedPoliciesOptions: PoliciesCallOptions = { headers: { Authorization: 'x' } }
void forgedPoliciesOptions
// @ts-expect-error Policy coordinates must originate from a strictly decoded PolicyView.
void policies.get('policy-fixture')
// @ts-expect-error Roles commands do not accept browser-authored authority headers.
void roles.assign(roleId, { subject: 'target' }, { headers: { Authorization: 'x' } })
// @ts-expect-error A command receipt has no authoritative binding projection.
void (await roles.assign(roleId, { subject: 'target' })).data.bindings
// @ts-expect-error Role coordinates must pass the single reviewed parser.
void roles.assign('ops', { subject: 'target' })
// @ts-expect-error Account Status does not accept caller-authored headers.
void accountStatus.get('f47ac10b-58cc-4372-a567-0e02b2c3d479', { headers: { Authorization: 'x' } })
// @ts-expect-error Password change does not accept caller-authored headers.
void session.changePassword(passwordChange, { headers: { Authorization: 'fixture' } })
// @ts-expect-error Session state never exposes bearer credentials.
void session.getState().accessToken
// @ts-expect-error Refresh is internal to the protected transport single-flight.
void session.refresh()
// @ts-expect-error A decoded profile DTO cannot be promoted to verified authority.
const forged: VerifiedProfile = { subject: 'x', tenantId: 'x', kind: 'user' }
void forged
