import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { agentViewEntry, type EntryTarget } from './agent-entry'

const vectors = JSON.parse(
  readFileSync(new URL('../../../contracts/agent-entry/v1-vectors.json', import.meta.url), 'utf8'),
) as {
  target: EntryTarget
  namespace: Parameters<typeof agentViewEntry>[1]
  uri: string
}[]

it.each(vectors)('copies the v1 URI $uri and its CLI command', ({ target, namespace, uri }) => {
  expect(agentViewEntry(target, namespace)).toEqual({ uri, command: `rssmdm open '${uri}'` })
  expect(new URL(uri).href).toBe(uri)
})

it('rejects privilege and secret extensions, malformed selectors, and incomplete enterprise coordinates', () => {
  const namespace = vectors[0]!.namespace,
    target: EntryTarget = { selector: { kind: 'event', name: 'repair.event' } }
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
