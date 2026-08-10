import type { WebMessageSchema } from './zh-CN'
type Widen<T> = T extends string
  ? string
  : T extends Record<string, unknown>
    ? { [K in keyof T]: Widen<T[K]> }
    : T

const enUS = {
  navigation: { home: 'Home', runtime: 'Runtime' },
  home: { subtitle: 'Verified identity with independently loaded Runtime and Audit facts.' },
  runtimeSummary: {
    title: 'Runtime summary',
    loading: 'Loading runtime facts…',
    schemaVersion: 'Schema version',
    assembly: 'Assembly fingerprint',
    plan: 'Runtime plan fingerprint',
    domains: 'Domains',
    details: 'View runtime details',
  },
  runtimeDetails: {
    title: 'Runtime details',
    subtitle:
      'Current RSS Runtime Inventory facts; deployment coordinates are not shown in the browser.',
    loading: 'Loading runtime details…',
    sourceRevision: 'Source revision',
    imageDigest: 'Image digest',
    buildDeclaration: 'Launch declaration; artifact provenance is not verified in the browser.',
    buildAbsent: 'This instance did not declare build metadata.',
    none: 'No reported items.',
    unobserved: 'No dynamic health evidence; this is not a readiness signal',
    sections: {
      version: 'Version and fingerprints',
      domains: 'Domains',
      listeners: 'Listeners',
      providers: 'Provider posture',
      workflows: 'Activated workflows',
      placements: 'Placements',
    },
  },
  auditEntries: {
    title: 'First audit entries',
    firstPageNotice: 'Shows the first server-ordered entries; this is not a latest view.',
    loading: 'Loading audit entries…',
    hasMore: 'More entries are available from the server.',
    outcome: 'Outcome',
    recordedAt: 'Recorded at',
    fingerprint: 'Opaque fingerprint',
    notVerified: 'not verified in the browser',
    refresh: 'Refresh first entries',
  },
  identity: {
    login: {
      title: 'Sign in',
      subtitle: 'Continue with RSS Identity credentials. Tenant is fixed by trusted deployment.',
      username: 'Username',
      password: 'Password',
      submit: 'Sign in',
      authenticating: 'Checking sign-in…',
      verifyingProfile: 'Verifying identity…',
      signingOut: 'Signing out safely…',
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
