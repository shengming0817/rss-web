/** MOCK_SOURCE: disposable HTTP fixtures, never device observations or authority. */
import { randomUUID } from 'node:crypto'
import type {
  Application,
  Assignment,
  AuditEntry,
  Binding,
  Computer,
  Configuration,
  Credential,
  Material,
  OriginalOperation,
  PasskeyRecord,
  Person,
} from '@rss/device-access/model'
export const TENANT = '11111111-1111-4111-8111-111111111111'
export const INSTANCE = '44444444-4444-4444-8444-444444444444'
export const PRINCIPAL = '22222222-2222-4222-8222-222222222222'
export const scenarios = [
  'normal',
  'readonly',
  'forbidden',
  'empty',
  'offline',
  'conflict',
  'unknown',
  'unavailable',
  'expired',
  'stepup',
] as const
export type Scenario = (typeof scenarios)[number]
export function seed() {
  const names = [
    'MacBook Pro · 林知夏',
    'ThinkPad X1 · 陈宇',
    'Surface Laptop · 王晨',
    'Mac mini · 测试工位',
    'MacBook Air · 许安',
    'ThinkPad T14 · 刘可',
  ]
  const people: Person[] = ['林知夏', '陈宇', '王晨', '赵宁', '许安', '刘可'].map((label) => ({
    id: randomUUID(),
    label,
  }))
  const now = Math.floor(Date.now() / 1000)
  const computers: Computer[] = names.map((name, i) => ({
    id: 'computer-' + (i + 1),
    name,
    platform: [0, 3, 4].includes(i) ? 'macos' : 'windows',
    registration: randomUUID(),
    generation: 2,
    status: i === 2 ? 'revoked' : 'active',
    lastObservedAt: i === 4 ? null : now - (i === 2 ? 172800 : 120),
  }))
  const bindings: Record<string, Binding[]> = {},
    assignments: Record<string, Assignment> = {},
    materials: Record<string, Material[]> = {},
    passkeys: Record<string, PasskeyRecord[]> = {}
  for (const [i, c] of computers.entries()) {
    const id = randomUUID()
    bindings[c.id] = [
      {
        id,
        device: c.id,
        revision: 12,
        principal: people[i]!.id,
        instance: INSTANCE,
        bindingGeneration: 3,
        factorGeneration: 2,
        account: c.platform === 'windows' ? 'S-1-5-21-111-222-333-' + (1000 + i) : randomUUID(),
        targetRevision: 12,
        receivedRevision: i === 4 ? null : i === 2 ? 11 : 12,
        appliedRevision: i === 4 ? null : [2, 3].includes(i) ? 11 : 12,
        serverState: i === 2 ? 'revoked' : 'active',
        observations: [
          {
            key: 'effect',
            state: i === 4 ? 'unknown' : 'known',
            value: i === 4 ? null : 'applied',
          },
          {
            key: 'userRegistered',
            state: i === 0 ? 'pending' : i === 4 ? 'unknown' : 'known',
            value: i === 0 ? 'needs_user' : i === 4 ? null : 'present',
          },
          {
            key: 'secureToken',
            state: c.platform === 'macos' ? 'known' : 'unknown',
            value: c.platform === 'macos' ? 'present' : null,
          },
          { key: 'volumeOwner', state: 'unknown', value: null },
          { key: 'filevaultUnlock', state: 'unknown', value: null },
        ],
      },
    ]
    assignments[c.id] = {
      device: c.id,
      revision: 1,
      assignee: people[i]!,
      owner: { id: 'organization', label: '北辰科技' },
    }
    materials[c.id] =
      c.platform === 'windows'
        ? [
            {
              id: randomUUID(),
              device: c.id,
              registration: c.registration!,
              generation: 2,
              version: 4,
              subject: {
                kind: 'rss_login',
                binding: id,
                bindingGeneration: 3,
                sid: bindings[c.id]![0]!.account,
              },
              escrowed: true,
              validity: i === 2 ? 'unknown' : 'verified',
              current: true,
            },
          ]
        : []
    passkeys[c.id] =
      i === 4
        ? []
        : [
            {
              id: 'enterprise-key-' + i,
              device: c.id,
              rp: 'dev.example.test',
              account: people[i]!.label,
              label: '研发门户',
              scope: 'enterprise',
              state: i === 2 ? 'revoked' : 'synced',
              lastObservedAt: c.lastObservedAt,
            },
            {
              id: 'help-key-' + i,
              device: c.id,
              rp: 'help.example.test',
              account: people[i]!.label,
              label: '内部工单',
              scope: 'enterprise',
              state: i === 3 ? 'pending' : 'synced',
              lastObservedAt: c.lastObservedAt,
            },
          ]
  }
  const scopes: Person[] = [
    { id: randomUUID(), label: '研发工程' },
    { id: randomUUID(), label: '产品设计' },
    { id: randomUUID(), label: '企业受管计算机' },
  ]
  const configurations: Configuration[] = [
    {
      id: randomUUID(),
      revision: 1,
      name: '标准设备访问',
      platform: 'windows',
      role: 'preserve',
      selfEnrollment: true,
      scope: scopes[0]!,
      exclusions: [],
      state: 'published',
      mode: 'rss_factor',
    },
  ]
  const applications: Application[] = [
    {
      id: 'rss-mdm',
      revision: 1,
      enabled: true,
      callback: 'https://mdm.example.test/callback',
      capabilities: ['native_key'],
    },
    {
      id: 'dev-portal',
      revision: 1,
      enabled: false,
      callback: 'https://dev.example.test/callback',
      capabilities: ['native_key', 'password'],
    },
  ]
  const credentials: Credential[] = [{ id: randomUUID(), label: '办公安全密钥' }]
  const audit: AuditEntry[] = [
    {
      id: randomUUID(),
      recordedAt: now,
      actor: '企业账号状态事件',
      action: '自动撤销企业访问',
      device: computers[2]!.id,
      outcome: 'accepted',
      phase: '离线待应用',
    },
  ]
  const operations = new Map<
    string,
    { principal: string; payload: string; result: unknown; operation: OriginalOperation }
  >()
  return {
    computers,
    people,
    scopes,
    bindings,
    assignments,
    materials,
    passkeys,
    configurations,
    applications,
    credentials,
    audit,
    operations,
  }
}
