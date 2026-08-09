import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CellHealthCard from './CellHealthCard.vue'
import type { CellHealthEntry } from '../api/health'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k),
  }),
}))

const fixture: CellHealthEntry = {
  name: 'accesscore',
  type: 'core',
  status: 'healthy',
  durability: 'Durable',
  version: 'v1.2.3',
  commit: 'abc1234',
  startedAt: '2024-01-01T00:00:00Z',
  uptimeSeconds: 3720,
  lastHealthCheckAt: '2024-01-01T01:02:00Z',
  lastHealthCheckDurationMs: 5,
  sliceCount: 3,
  slices: [
    { name: 'slice-a', status: 'healthy', lastErrorAt: null, lastErrorMessage: null },
    { name: 'slice-b', status: 'healthy', lastErrorAt: null, lastErrorMessage: null },
    {
      name: 'slice-c',
      status: 'degraded',
      lastErrorAt: '2024-01-01T00:30:00Z',
      lastErrorMessage: 'connection refused',
    },
  ],
}

describe('CellHealthCard', () => {
  it('renders cell name as heading', () => {
    const wrapper = mount(CellHealthCard, { props: { cell: fixture } })
    expect(wrapper.find('h3').text()).toBe('accesscore')
  })

  it('aria-labelledby wiring: section aria-labelledby matches heading id', () => {
    const wrapper = mount(CellHealthCard, { props: { cell: fixture } })
    const section = wrapper.find('section')
    const heading = wrapper.find('h3')
    expect(section.attributes('aria-labelledby')).toBe(heading.attributes('id'))
  })

  it('heading id is derived from cell name', () => {
    const wrapper = mount(CellHealthCard, { props: { cell: fixture } })
    const id = wrapper.find('h3').attributes('id')
    expect(id).toContain('accesscore')
  })

  it('renders CellHealthBadge (badge element is present)', () => {
    const wrapper = mount(CellHealthCard, { props: { cell: fixture } })
    expect(wrapper.find('.badge').exists()).toBe(true)
  })

  it('renders version and commit in mono', () => {
    const wrapper = mount(CellHealthCard, { props: { cell: fixture } })
    const monos = wrapper.findAll('.mono')
    const texts = monos.map((m) => m.text())
    expect(texts).toContain('v1.2.3')
    expect(texts).toContain('abc1234')
  })

  it('renders uptime label', () => {
    const wrapper = mount(CellHealthCard, { props: { cell: fixture } })
    const html = wrapper.html()
    expect(html).toContain('landing.cell.uptime')
  })

  it('renders slice summary with healthy and total counts', () => {
    const wrapper = mount(CellHealthCard, { props: { cell: fixture } })
    const html = wrapper.html()
    // t mock returns "key:{...params}" so check the key + both counts
    expect(html).toContain('landing.cell.sliceSummary')
    expect(html).toContain('"healthy":2')
    expect(html).toContain('"total":3')
  })

  it('renders lastError when a slice has an error message', () => {
    const wrapper = mount(CellHealthCard, { props: { cell: fixture } })
    const html = wrapper.html()
    expect(html).toContain('landing.cell.lastError')
    expect(html).toContain('connection refused')
  })

  it('does NOT render lastError row when no slice has errors', () => {
    const noErrors: CellHealthEntry = {
      ...fixture,
      slices: fixture.slices.map((s) => ({ ...s, lastErrorMessage: null, lastErrorAt: null })),
    }
    const wrapper = mount(CellHealthCard, { props: { cell: noErrors } })
    expect(wrapper.html()).not.toContain('landing.cell.lastError')
  })

  it('handles cell names with special characters in heading id', () => {
    const special: CellHealthEntry = { ...fixture, name: 'my cell/test' }
    const wrapper = mount(CellHealthCard, { props: { cell: special } })
    const id = wrapper.find('h3').attributes('id') ?? ''
    // Should not contain slash
    expect(id).not.toContain('/')
  })
})
