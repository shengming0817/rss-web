import type {
  AgentSettingsValues,
  AdeSetup,
  Channel,
  ConfigurationDetail,
  ConfigurationIntent,
  EntraPolicy,
  Limits,
  NativeIntent,
  NativeInstructions,
  Target,
  User,
} from './model'
import { setupPanes } from './model'
export const channels: readonly Channel[] = ['agent', 'windows_mdm', 'macos_mdm']
export const configurationFilename = 'rss-agent-enrollment.json'
export function uuid(value: string): string {
  if (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)
  )
    throw new Error('Invalid identifier')
  return value
}
export function boundedText(value: string, maximum: number, multiline = false): string {
  if (
    new TextEncoder().encode(value).length > maximum ||
    [...value].some((c) => /\p{Cc}/u.test(c) && !(multiline && ['\n', '\r', '\t'].includes(c)))
  )
    throw new Error('Invalid text')
  return value
}
export function revision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER)
    throw new Error('Invalid revision')
  return value
}
export function secret256(value: string): void {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value) || !'AEIMQUYcgkosw048'.includes(value.at(-1)!))
    throw new Error('Invalid secret encoding')
}
export function validateUser(user: User, tenant: string): void {
  if (uuid(user.tenantId) !== tenant) throw new Error('Wrong quota tenant')
  uuid(user.instanceId)
  uuid(user.principalId)
}
export function validateLimits(limits: Limits, defaults: boolean): void {
  if (Object.keys(limits).length !== channels.length) throw new Error('Invalid quota channels')
  for (const channel of channels) {
    const value = limits[channel]
    if (value === null && !defaults) continue
    if (value === null || !Number.isSafeInteger(value) || value < 0 || value > 4294967295)
      throw new Error('Invalid quota limit')
  }
}
export function validateTargets(targets: readonly Target[]): void {
  if (
    !targets.length ||
    targets.length > 4 ||
    new Set(targets.map((t) => `${t.platform}/${t.architecture}`)).size !== targets.length ||
    targets.some(
      (t) =>
        !['windows', 'macos'].includes(t.platform) ||
        !['x86_64', 'aarch64'].includes(t.architecture),
    )
  )
    throw new Error('Invalid installation targets')
}
/** The server alone decides current admission and quota allocation. */
export function nativeIntent(
  operationId: string,
  source: NativeIntent['source'],
  windowsProfile: NativeIntent['windowsProfile'],
): NativeIntent {
  uuid(operationId)
  if (
    !['mdm.windows', 'mdm.apple'].includes(source) ||
    !['Full', 'Device'].includes(windowsProfile)
  )
    throw new Error('Invalid native enrollment')
  return Object.freeze({
    operationId,
    source,
    windowsProfile,
  })
}
export function configurationIntent(input: ConfigurationIntent): ConfigurationIntent {
  uuid(input.operationId)
  validateTargets(input.targets)
  if (
    input.lifetimeSeconds !== null &&
    (!Number.isSafeInteger(input.lifetimeSeconds) ||
      input.lifetimeSeconds < 1 ||
      input.lifetimeSeconds > 31536000)
  )
    throw new Error('Invalid configuration lifetime')
  if (
    input.quantity.kind !== 'unlimited' &&
    (input.quantity.kind !== 'finite' ||
      !Number.isSafeInteger(input.quantity.count) ||
      input.quantity.count < 1 ||
      input.quantity.count > 4294967295)
  )
    throw new Error('Invalid configuration quantity')
  return Object.freeze({
    ...input,
    quantity: Object.freeze({ ...input.quantity }),
    targets: Object.freeze(input.targets.map((t) => Object.freeze({ ...t }))),
  })
}
export function validateConfigurationUsage(
  detail: Pick<ConfigurationDetail, 'configuration' | 'remaining' | 'reserved' | 'consumed'>,
): void {
  for (const value of [detail.reserved, detail.consumed])
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid configuration usage')
  const quantity = detail.configuration.quantity
  if (
    quantity.kind === 'unlimited'
      ? detail.remaining !== null
      : detail.remaining !== quantity.count - detail.reserved - detail.consumed ||
        detail.remaining < 0
  )
    throw new Error('Invalid configuration remaining count')
}
export function validateEntra(policy: EntraPolicy): void {
  boundedText(policy.termsVersion, 128)
  boundedText(policy.termsText, 32768, true)
  if (
    policy.users.length > 256 ||
    new Set(policy.users).size !== policy.users.length ||
    (policy.allUsers && policy.users.length)
  )
    throw new Error('Invalid Entra users')
  policy.users.forEach(uuid)
  if (
    policy.enabled &&
    (!policy.termsVersion || !policy.termsText.trim() || (!policy.allUsers && !policy.users.length))
  )
    throw new Error('Incomplete Entra policy')
}
export function validateSetup(setup: AdeSetup): void {
  boundedText(setup.name, 128)
  if (
    !setup.name.trim() ||
    (!setup.mandatory && !setup.removable) ||
    new Set(setup.skip).size !== setup.skip.length ||
    setup.skip.some((pane) => !setupPanes.includes(pane))
  )
    throw new Error('Invalid ADE setup')
}
export function windowsEnrollmentLink(instructions: NativeInstructions): string | null {
  if (instructions.platform !== 'windows' || instructions.windowsProfile !== 'Full') return null
  const server = new URL(instructions.server)
  if (
    server.protocol !== 'https:' ||
    server.username ||
    server.password ||
    server.search ||
    server.hash ||
    server.pathname !== '/'
  )
    throw new Error('Invalid native server')
  return `ms-device-enrollment:?${new URLSearchParams({ mode: 'mdm', username: instructions.username, servername: instructions.server })}`
}

export function validateAgentSettings(values: AgentSettingsValues): void {
  if (
    !Number.isSafeInteger(values.grantSeconds) ||
    values.grantSeconds < 1 ||
    values.grantSeconds > 604800 ||
    !Number.isSafeInteger(values.configurationDefaultSeconds) ||
    values.configurationDefaultSeconds < 1 ||
    values.configurationDefaultSeconds > 31536000 ||
    values.platforms.length > 2 ||
    new Set(values.platforms).size !== values.platforms.length ||
    values.platforms.some((p) => !['windows', 'macos'].includes(p))
  )
    throw new Error('Invalid Agent enrollment settings')
}
