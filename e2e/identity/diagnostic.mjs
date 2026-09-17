// Closed projection shared by the transport runner and its outer receipt owner.
export function transportDiagnostic(value) {
  const steps = [
    'config',
    'session',
    'login',
    'refresh',
    'reauthenticate',
    'accounts',
    'providers',
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
