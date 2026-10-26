import type {
  Applicability,
  ValueMapping,
} from '../../contracts/collection/generated/ResourceWrite'
export const defaultApplicability = (): Applicability => ({
  minimumOsVersion: null,
  minimumBuild: null,
  editions: [],
  enrollments: [],
  tools: {},
  capabilities: [],
})
export const identityMapping = (pointer: string): ValueMapping => ({
  pointer,
  conversion: { kind: 'identity' },
  columns: {},
})
