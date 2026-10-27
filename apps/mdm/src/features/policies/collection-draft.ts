import type { Applicability, ValueMapping } from '@rss/api/mdm-types'
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
