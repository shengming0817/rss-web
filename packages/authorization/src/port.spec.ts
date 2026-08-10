import { describe, expect, it, vi } from 'vitest'
import * as authorization from './index'
import { createServerAuthorizationPort } from './index'
import { createPreviewAuthorizationPort } from './preview'
import type { AuthorizationIntent, AuthorizationPort } from './index'

const intent: AuthorizationIntent = {
  contractId: 'identity.policies-update',
  permission: 'identity:policy:update',
  resourceId: 'policy-1',
}

function forbidden(): Error & { readonly status: 403 } {
  return Object.assign(new Error('forbidden sentinel'), { status: 403 as const })
}

function assertExecutePassthrough(port: AuthorizationPort): void {
  it('executes an operation exactly once and preserves its successful value', async () => {
    const value = Object.freeze({ result: 'server-owned' })
    const operation = vi.fn().mockResolvedValue(value)

    await expect(port.execute(intent, operation)).resolves.toBe(value)
    expect(operation).toHaveBeenCalledOnce()
  })

  it('does not let a hint replace a real 403', async () => {
    const error = forbidden()
    const operation = vi.fn().mockRejectedValue(error)

    await expect(port.execute(intent, operation)).rejects.toBe(error)
    expect(operation).toHaveBeenCalledOnce()
  })
}

describe('server-authoritative authorization port', () => {
  const port = createServerAuthorizationPort()

  it('defers every UX hint to the real request', () => {
    expect(port.preview(intent)).toEqual({
      decision: 'unknown',
      source: { kind: 'server', authority: 'deferred-to-request' },
    })
  })

  assertExecutePassthrough(port)

  it('does not expose the Preview constructor from the production root', () => {
    expect(authorization).not.toHaveProperty('createPreviewAuthorizationPort')
  })
})

describe('explicit Preview authorization port', () => {
  const port = createPreviewAuthorizationPort({
    enabled: true,
    scenarios: [
      { id: 'allow-policy-edit', intent, decision: 'allow' },
      {
        id: 'deny-policy-read',
        intent: { contractId: 'identity.policies-get', permission: 'identity:policy:read' },
        decision: 'deny',
      },
      {
        id: 'unknown-policy-create',
        intent: { contractId: 'identity.policies-create', permission: 'identity:policy:create' },
        decision: 'unknown',
      },
    ],
  })

  it.each([
    [intent, 'allow', 'allow-policy-edit'],
    [
      { contractId: 'identity.policies-get', permission: 'identity:policy:read' },
      'deny',
      'deny-policy-read',
    ],
    [
      { contractId: 'identity.policies-create', permission: 'identity:policy:create' },
      'unknown',
      'unknown-policy-create',
    ],
  ] as const)('returns the exact scenario hint for %o', (requested, decision, scenarioId) => {
    expect(port.preview(requested)).toEqual({
      decision,
      source: { kind: 'preview', authoritative: false, reason: 'scenario', scenarioId },
    })
  })

  it('returns a non-authoritative unknown hint for unmatched or invalid input', () => {
    for (const requested of [
      { contractId: 'identity.policies-update', permission: 'identity:policy:update' },
      { contractId: '', permission: 'identity:policy:update' },
    ]) {
      expect(port.preview(requested)).toEqual({
        decision: 'unknown',
        source: { kind: 'preview', authoritative: false, reason: 'unmatched' },
      })
    }
  })

  it('treats structurally assignable intents with authority fields as unmatched', () => {
    const requestedWithTenant = { ...intent, tenantId: 'tenant-a' }

    expect(port.preview(requestedWithTenant)).toEqual({
      decision: 'unknown',
      source: { kind: 'preview', authoritative: false, reason: 'unmatched' },
    })
  })

  assertExecutePassthrough(port)
})

describe('Preview scenario validation', () => {
  it('accepts an opaque permission token used by the selected RSS baseline', () => {
    expect(() =>
      createPreviewAuthorizationPort({
        enabled: true,
        scenarios: [
          {
            id: 'settings-get',
            intent: { contractId: 'settings.config-get', permission: 'settings.config-get' },
            decision: 'allow',
          },
        ],
      }),
    ).not.toThrow()
  })

  it.each([
    [{ id: '', intent, decision: 'allow' }],
    [{ id: 'empty-contract', intent: { contractId: '', permission: 'p' }, decision: 'allow' }],
    [{ id: 'empty-permission', intent: { contractId: 'c', permission: '' }, decision: 'allow' }],
    [
      {
        id: 'empty-resource',
        intent: { contractId: 'c', permission: 'p', resourceId: '' },
        decision: 'allow',
      },
    ],
    [{ id: 'wildcard', intent: { contractId: 'c.*', permission: 'p' }, decision: 'allow' }],
    [{ id: 'invalid-decision', intent, decision: 'grant' as never }],
  ] as const)('rejects invalid or ambiguous selectors: %o', (scenario) => {
    expect(() => createPreviewAuthorizationPort({ enabled: true, scenarios: [scenario] })).toThrow()
  })

  it('rejects duplicate exact selectors', () => {
    expect(() =>
      createPreviewAuthorizationPort({
        enabled: true,
        scenarios: [
          { id: 'first', intent, decision: 'allow' },
          { id: 'second', intent, decision: 'deny' },
        ],
      }),
    ).toThrow()
  })

  it('rejects duplicate scenario ids even when selectors differ', () => {
    expect(() =>
      createPreviewAuthorizationPort({
        enabled: true,
        scenarios: [
          { id: 'same', intent, decision: 'allow' },
          {
            id: 'same',
            intent: { contractId: 'identity.policies-get', permission: 'identity:policy:read' },
            decision: 'deny',
          },
        ],
      }),
    ).toThrow()
  })

  it('rejects extra keys in options, scenarios, and intents passed through variables', () => {
    const extraOption = { enabled: true, scenarios: [], tenantId: 'tenant-a' } as const
    const extraScenario = { id: 'extra', intent, decision: 'allow', principal: 'alice' } as const
    const extraIntent = { ...intent, attributes: { department: 'ops' } }

    expect(() => createPreviewAuthorizationPort(extraOption)).toThrow()
    expect(() =>
      createPreviewAuthorizationPort({ enabled: true, scenarios: [extraScenario] }),
    ).toThrow()
    expect(() =>
      createPreviewAuthorizationPort({
        enabled: true,
        scenarios: [{ id: 'extra-intent', intent: extraIntent, decision: 'allow' }],
      }),
    ).toThrow()
  })
})
