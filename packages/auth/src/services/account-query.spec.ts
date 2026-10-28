import { it, expect } from 'vitest'
import { accountQuery, accountPage } from './account-query'
it('decodes real partial account rows without requiring or fabricating omitted properties', () => {
  const page = accountPage(
    {
      accounts: [{ principalId: '11111111-1111-4111-8111-111111111111', email: null }],
      nextCursor: null,
    },
    ['principalId', 'email'],
  )
  expect(page.accounts[0]).toEqual({
    principalId: '11111111-1111-4111-8111-111111111111',
    email: null,
  })
  expect(() =>
    accountPage(
      {
        accounts: [
          { principalId: '11111111-1111-4111-8111-111111111111', email: null, enabled: true },
        ],
        nextCursor: null,
      },
      ['principalId', 'email'],
    ),
  ).toThrow()
})
it('rejects retired UUID account cursors and invalid field or page contracts', () => {
  expect(() => accountQuery({ cursor: '11111111-1111-4111-8111-111111111111' })).toThrow()
  expect(() => accountQuery({ limit: 101 })).toThrow()
  expect(
    accountQuery({
      fields: ['principalId', 'email'],
      source: 'local',
      filter: "email=icontains='example'",
      limit: 1,
    }),
  ).toMatchObject({ fields: 'principalId,email', source: 'local', limit: '1' })
})
it('keeps one complete department snapshot and decodes unavailable or empty observations explicitly', () => {
  const fields = [
    'principalId',
    'displayName',
    'email',
    'profileStatus',
    'departmentStatus',
    'departmentSnapshot',
  ] as const
  const row = {
    principalId: '11111111-1111-4111-8111-111111111111',
    displayName: 'Name',
    email: 'name@example.test',
    profileStatus: 'available',
    departmentStatus: 'available',
    departmentSnapshot: {
      version: 1,
      sourceRevision: 'r2',
      nodes: [
        { id: 'engineering', displayName: 'Engineering', parentId: null },
        { id: 'platform', displayName: 'Platform', parentId: 'engineering' },
      ],
      memberships: [],
    },
  }
  const decoded = accountPage({ accounts: [row], nextCursor: null }, fields).accounts[0]!
  expect(decoded.departmentSnapshot?.memberships).toEqual([])
  expect(decoded.displayName).toBe('Name')
  expect(
    accountPage(
      {
        accounts: [
          {
            ...row,
            departmentStatus: 'expired',
            departmentSnapshot: null,
            profileStatus: 'invalid_claim',
            displayName: null,
            email: null,
          },
        ],
        nextCursor: null,
      },
      fields,
    ).accounts[0]?.departmentStatus,
  ).toBe('expired')
  expect(() =>
    accountPage({ accounts: [{ ...row, departmentStatus: 'invented' }], nextCursor: null }, fields),
  ).toThrow()
})
