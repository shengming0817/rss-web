import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { EntryIntent } from './agent-entry.generated'
import { addressableAlias, agentViewEntry, type EntryTarget } from './agent-entry'
import { unaddressableAliases } from './agent-entry.generated'

const { vectors } = JSON.parse(
  readFileSync(new URL('../../../contracts/agent-entry/contract.json', import.meta.url), 'utf8'),
) as { vectors: { intent: EntryIntent; uri: string }[] }

it('emits exactly the canonical Rust URI and CLI open command for every supported locator', () => {
  expect(vectors.map(({ intent }) => intent.selector.kind)).toEqual([
    'capability',
    'capability',
    'capability',
    'event',
    'batch',
    'task',
    'activity',
    'node',
  ])
  for (const { intent, uri } of vectors) {
    const { selector, namespace, version, revision, step } = intent
    const formatted = agentViewEntry(
      {
        selector,
        ...(version ? { version } : {}),
        ...(revision ? { revision } : {}),
        ...(step ? { step } : {}),
      } as EntryTarget,
      namespace!,
    )
    expect(formatted.uri).toBe(uri)
    expect(formatted.command).toBe(`rssmdm open '${uri}'`)
  }
})

it('rejects privilege and secret extensions, malformed selectors, and incomplete enterprise coordinates', () => {
  const namespace = vectors[0]!.intent.namespace!,
    target: EntryTarget = { selector: { kind: 'event', name: 'repair.event' } }
  for (const alias of unaddressableAliases) {
    expect(addressableAlias(alias)).toBe(false)
    expect(() =>
      agentViewEntry(
        { selector: { kind: 'capability', selector: { kind: 'alias', alias } } },
        namespace,
      ),
    ).toThrow()
  }
  for (const invalid of [
    { ...target, confirm: true },
    { ...target, parameters: { secret: 'value' } },
    { ...target, server: 'https://elsewhere.test' },
    { ...target, step: 'unrelated' },
    { ...target, version: '11111111-1111-4111-8111-111111111111' },
    { selector: { kind: 'task', task: '11111111-1111-4111-8111-111111111111' } },
    { selector: { kind: 'capability', selector: { kind: 'tool_name', name: 'Display name' } } },
  ])
    expect(() => agentViewEntry(invalid as EntryTarget, namespace)).toThrow()
  for (const invalid of [
    { ...namespace, generation: 0 },
    { ...namespace, registration: '' },
    { ...namespace, instance: 'https://elsewhere.test' },
    { ...namespace, device: 'device\nsecret' },
    { ...namespace, token: 'secret' },
  ])
    expect(() => agentViewEntry(target, invalid)).toThrow()
})
