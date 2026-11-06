// Closed projection shared by the transport runner and integration failure reporting.
export function transportDiagnostic(value) {
  if (
    value?.test === 'identity-browser' &&
    value.file === 'e2e/identity/browser.mjs' &&
    [
      'startup',
      'login',
      'account-directory',
      'provider-management',
      'resume',
      'theme-and-responsive',
      'logout',
    ].includes(value.step)
  )
    return { test: value.test, file: value.file, step: value.step }

  const steps = [
    'config',
    'session',
    'login',
    'refresh',
    'reauthenticate',
    'accounts',
    'providers-create',
    'providers-create-readback',
    'providers-update',
    'providers-update-readback',
    'providers-test',
    'providers-enable',
    'step-up',
    'logout',
    'forbidden',
  ]
  if (
    value?.test !== 'identity-transport' ||
    value.file !== 'e2e/identity/transport.spec.ts' ||
    !steps.includes(value.step) ||
    !Number.isSafeInteger(value.line) ||
    value.line < 1
  )
    return undefined
  return { test: value.test, step: value.step, file: value.file, line: value.line }
}
