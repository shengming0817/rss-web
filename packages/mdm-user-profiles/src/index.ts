export * from './model'
export * from './authoring'
import type {
  Definition,
  DefinitionChange,
  DefinitionValue,
  ProfilesPort,
  Profile,
  ProfileSource,
} from './model'
import { uuid, validateDefinition } from './authoring'
export function prepareDefinition(
  operationId: string,
  detail: Definition,
  value: DefinitionValue | null,
): DefinitionChange {
  uuid(operationId)
  uuid(detail.fieldId)
  if (!detail.value || detail.revision < 1)
    throw new Error('A tombstone cannot be edited or recreated')
  return {
    operationId,
    fieldId: detail.fieldId,
    expectedRevision: detail.revision,
    value: structuredClone(value),
  }
}
function sameSource(a: ProfileSource, b: ProfileSource): boolean {
  return a.kind === b.kind && (a.kind !== 'idp' || (b.kind === 'idp' && a.provider === b.provider))
}
/** Remove expired observations immediately; this never chooses a different source or refreshes TTL. */
export function visibleProfile(
  profile: Profile,
  nowSeconds: number,
): { profile: Profile; completenessStale: boolean } {
  const expired = profile.profiles.filter(
    (p) => p.status === 'available' && p.expiresAt !== null && p.expiresAt <= nowSeconds,
  )
  if (!expired.length) return { profile, completenessStale: false }
  return {
    profile: {
      ...profile,
      profiles: profile.profiles.map((p) =>
        expired.includes(p) ? { ...p, status: 'expired', fixed: null } : p,
      ),
      fields: profile.fields.map((f) =>
        expired.some((p) => p.source !== null && sameSource(p.source, f.source)) &&
        (f.status === 'available' || f.status === 'redacted')
          ? { ...f, status: 'expired', value: null }
          : f,
      ),
    },
    // Preserve the server's counts as stale rather than fabricating completeness from visible fields.
    completenessStale: true,
  }
}
export function nextProfileExpiry(profile: Profile): number | null {
  const times = profile.profiles
    .filter((p) => p.status === 'available' && p.expiresAt !== null)
    .map((p) => p.expiresAt!)
  return times.length ? Math.min(...times) : null
}
export function createProfiles(port: ProfilesPort, principalId: string) {
  uuid(principalId)
  return {
    ...port,
    async save(change: DefinitionChange) {
      uuid(change.operationId)
      uuid(change.fieldId)
      if (
        !Number.isSafeInteger(change.expectedRevision) ||
        change.expectedRevision < 0 ||
        change.expectedRevision >= Number.MAX_SAFE_INTEGER
      )
        throw new Error('Invalid field revision')
      if (change.value !== null) validateDefinition(change.value)
      else if (!change.expectedRevision) throw new Error('Cannot delete an absent field')
      const receipt = await port.save(change)
      if (
        receipt.operationId !== change.operationId ||
        receipt.definition.fieldId !== change.fieldId ||
        receipt.definition.revision !== change.expectedRevision + 1 ||
        (receipt.definition.value === null) !== (change.value === null)
      )
        throw new Error('Wrong field receipt')
      return receipt
    },
    async self(view: Profile['view'], preview: boolean) {
      const profile = await port.self(view, preview)
      if (profile.principalId !== principalId || profile.view !== view)
        throw new Error('Wrong self profile')
      return profile
    },
    async other(principal: string, preview: boolean) {
      uuid(principal)
      const profile = await port.other(principal, preview)
      if (profile.principalId !== principal || profile.view !== 'latest')
        throw new Error('Wrong profile projection')
      return profile
    },
  }
}
