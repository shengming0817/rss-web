import type { WebMessageSchema } from './zh-CN'
type Widen<T> = T extends string
  ? string
  : T extends Record<string, unknown>
    ? { [K in keyof T]: Widen<T[K]> }
    : T

const enUS = {
  identity: {
    login: {
      title: 'Sign in',
      subtitle: 'Continue with RSS Identity credentials. Tenant is fixed by trusted deployment.',
      username: 'Username',
      password: 'Password',
      submit: 'Sign in',
      authenticating: 'Checking sign-in…',
      verifyingProfile: 'Verifying identity…',
    },
    errors: {
      required: 'Enter your username and password.',
      invalidCredentials: 'The credentials are invalid. Try again.',
      forbidden: 'This account cannot access the application.',
      conflict: 'The sign-in state changed. Try again.',
      rateLimited: 'Too many attempts. Try again later.',
      serviceUnavailable: 'The identity service is temporarily unavailable.',
      connection: 'The identity service could not be reached.',
      timeout: 'The identity request timed out.',
      invalidResponse: 'The identity service returned an invalid response.',
      profileVerificationFailed: 'The full identity could not be verified. No session was created.',
      alreadySubmitting: 'Sign-in is already in progress.',
      unknown: 'Sign-in failed. Try again.',
    },
    notice: {
      signedOut: 'You have signed out safely.',
      logoutUnconfirmed:
        'The local session was cleared, but server sign-out could not be confirmed.',
      sessionExpired: 'The session expired. Sign in again.',
    },
    profile: { title: 'Verified identity', subject: 'Subject', tenant: 'Tenant', kind: 'Kind' },
    actions: { logout: 'Sign out', logoutAll: 'Sign out all sessions' },
    logoutAll: {
      title: 'Sign out all sessions?',
      description: 'This revokes every session for this account, including other devices.',
      cancel: 'Cancel',
      confirm: 'Sign out all',
    },
  },
} satisfies Widen<WebMessageSchema>

export default enUS
