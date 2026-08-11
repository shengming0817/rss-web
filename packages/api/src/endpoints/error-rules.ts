import type { EndpointErrorRule } from '../types'

function rule(value: EndpointErrorRule): EndpointErrorRule {
  return Object.freeze(value)
}

export const VALIDATION_PUBLIC = rule({
  code: 'ERR_CORE_VALIDATION',
  message: 'validation error',
  retryable: false,
  details: 'public',
})

export const VALIDATION_EMPTY = rule({
  code: 'ERR_CORE_VALIDATION',
  message: 'validation error',
  retryable: false,
  details: 'empty',
})

export const NOT_FOUND_EMPTY = rule({
  code: 'ERR_CORE_NOT_FOUND',
  message: 'not found',
  retryable: false,
  details: 'empty',
})

export const OUTBOX_FACT_CONFLICT_EMPTY = rule({
  code: 'ERR_CORE_OUTBOX_FACT_CONFLICT',
  message: 'outbox fact conflict',
  retryable: false,
  details: 'empty',
})

export const CONFLICT_EMPTY = rule({
  code: 'ERR_CORE_CONFLICT',
  message: 'conflict',
  retryable: false,
  details: 'empty',
})

export const VERSION_CONFLICT_EMPTY = rule({
  code: 'ERR_CORE_VERSION_CONFLICT',
  message: 'version conflict',
  retryable: true,
  details: 'empty',
})

export const INTERNAL_EMPTY = rule({
  code: 'ERR_CORE_INTERNAL',
  message: 'internal error',
  retryable: false,
  details: 'empty',
})
