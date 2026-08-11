import type { ConfigEntry, SettingsApi } from '@rss/settings'
import { describe, expect, it, vi } from 'vitest'
import { createConfigOperation } from './config-operation'

const entry: ConfigEntry = { key: 'app.k', value: 'sensitive-v', version: 2 as never }

function api(overrides: Partial<SettingsApi> = {}): SettingsApi {
  return {
    get: vi.fn().mockResolvedValue({ data: entry }),
    publish: vi.fn().mockResolvedValue({ data: { key: 'app.k', version: 3 } }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('Config operation', () => {
  it('reads an authoritative entry and confirms publish without exposing the value in state', async () => {
    const settings = api()
    const operation = createConfigOperation(settings)
    await operation.read('app.k')
    expect(operation.getState()).toEqual({ status: 'ready', entry })
    expect(operation.beginPublish('app.k')).toBe(true)
    expect(operation.getState()).toEqual({ status: 'confirming-publish', key: 'app.k' })
    const promise = operation.confirmPublish('new-sensitive')
    expect(JSON.stringify(operation.getState())).not.toContain('new-sensitive')
    await promise
    expect(settings.publish).toHaveBeenCalledWith(
      { key: 'app.k', value: 'new-sensitive' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(operation.getState()).toEqual({
      status: 'published',
      coordinate: { key: 'app.k', version: 3 },
    })
  })

  it('turns publish transport ambiguity into value-free unknown and never replays', async () => {
    const failure = Object.assign(new Error('network'), { cause: 'network' })
    const publish = vi.fn().mockRejectedValue(failure)
    const operation = createConfigOperation(api({ publish }))
    operation.beginPublish('app.k')
    await operation.confirmPublish('must-disappear')
    expect(publish).toHaveBeenCalledOnce()
    expect(operation.getState()).toEqual({ status: 'unknown', key: 'app.k', error: failure })
    expect(JSON.stringify(operation.getState())).not.toContain('must-disappear')
  })

  it('confirms delete and fences stale reads after reset', async () => {
    let resolve!: (value: { data: ConfigEntry }) => void
    const get = vi.fn().mockReturnValue(
      new Promise<{ data: ConfigEntry }>((done) => {
        resolve = done
      }),
    )
    const settings = api({ get })
    const operation = createConfigOperation(settings)
    const pending = operation.read('app.k')
    operation.reset()
    resolve({ data: entry })
    await pending
    expect(operation.getState()).toEqual({ status: 'idle' })
    operation.beginDelete('app.k')
    await operation.confirmDelete()
    expect(settings.delete).toHaveBeenCalledOnce()
    expect(operation.getState()).toEqual({ status: 'deleted', key: 'app.k' })
  })
})
