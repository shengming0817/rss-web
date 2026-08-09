import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SystemInfoCard from './SystemInfoCard.vue'
import type { SystemInfoResponse } from '../api/system'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// Stub UnavailablePanel so we can assert on role="status" without needing @gocell/core
vi.mock('@gocell/core', () => ({
  UnavailablePanel: {
    name: 'UnavailablePanel',
    props: ['title', 'message'],
    template: '<div role="status" class="unavailable-stub">{{ message }}</div>',
  },
}))

const fixture: SystemInfoResponse = {
  build: {
    version: 'v1.0.0',
    commit: 'deadbeef',
    commitDate: '2024-01-01',
    buildDate: '2024-01-01',
    goVersion: 'go1.22.0',
    tags: [],
    dirty: false,
  },
  runtime: {
    uptimeSeconds: 90,
    goroutines: 42,
    memoryMB: 128,
    memoryAllocBytes: 134217728,
    gcPauseTotalNs: 0,
    cpuPercent: 0.5,
    pid: 1234,
  },
  assembly: {
    name: 'gocell',
    cells: ['accesscore', 'auditcore'],
    primaryAddr: '0.0.0.0:8080',
    internalAddr: '0.0.0.0:9090',
  },
  environment: {
    env: 'production',
    hostname: 'gocell-node-1',
    containerized: true,
  },
}

describe('SystemInfoCard', () => {
  describe('unavailable branch', () => {
    it('renders UnavailablePanel when status="unavailable"', () => {
      const wrapper = mount(SystemInfoCard, {
        props: { system: fixture, status: 'unavailable' },
      })
      expect(wrapper.find('[role="status"]').exists()).toBe(true)
      expect(wrapper.find('section').exists()).toBe(false)
    })

    it('renders UnavailablePanel when system=null (even if status="loaded")', () => {
      const wrapper = mount(SystemInfoCard, {
        props: { system: null, status: 'loaded' },
      })
      expect(wrapper.find('[role="status"]').exists()).toBe(true)
    })

    it('passes unavailable message key to UnavailablePanel', () => {
      const wrapper = mount(SystemInfoCard, {
        props: { system: null, status: 'unavailable' },
      })
      expect(wrapper.find('.unavailable-stub').text()).toBe('landing.system.unavailable')
    })
  })

  describe('loaded branch', () => {
    it('renders section with aria-labelledby when system is present', () => {
      const wrapper = mount(SystemInfoCard, {
        props: { system: fixture, status: 'loaded' },
      })
      const section = wrapper.find('section')
      expect(section.exists()).toBe(true)
      expect(section.attributes('aria-labelledby')).toBeTruthy()
    })

    it('aria-labelledby matches h2 heading id', () => {
      const wrapper = mount(SystemInfoCard, {
        props: { system: fixture, status: 'loaded' },
      })
      const section = wrapper.find('section')
      const heading = wrapper.find('h2')
      expect(section.attributes('aria-labelledby')).toBe(heading.attributes('id'))
    })

    it('renders system title heading', () => {
      const wrapper = mount(SystemInfoCard, {
        props: { system: fixture, status: 'loaded' },
      })
      expect(wrapper.find('h2').text()).toBe('landing.system.title')
    })

    it('renders version from build info', () => {
      const wrapper = mount(SystemInfoCard, {
        props: { system: fixture, status: 'loaded' },
      })
      expect(wrapper.html()).toContain('v1.0.0')
    })

    it('renders commit in mono', () => {
      const wrapper = mount(SystemInfoCard, {
        props: { system: fixture, status: 'loaded' },
      })
      const monos = wrapper.findAll('.mono')
      const texts = monos.map((m) => m.text())
      expect(texts).toContain('deadbeef')
    })

    it('renders goVersion', () => {
      const wrapper = mount(SystemInfoCard, {
        props: { system: fixture, status: 'loaded' },
      })
      expect(wrapper.html()).toContain('go1.22.0')
    })

    it('renders clean label when dirty=false', () => {
      const wrapper = mount(SystemInfoCard, {
        props: { system: fixture, status: 'loaded' },
      })
      expect(wrapper.html()).toContain('landing.system.dirtyClean')
      expect(wrapper.html()).not.toContain('landing.system.dirtyYes')
    })

    it('renders dirtyYes when dirty=true', () => {
      const dirtyFixture: SystemInfoResponse = {
        ...fixture,
        build: { ...fixture.build, dirty: true },
      }
      const wrapper = mount(SystemInfoCard, {
        props: { system: dirtyFixture, status: 'loaded' },
      })
      expect(wrapper.html()).toContain('landing.system.dirtyYes')
      expect(wrapper.html()).not.toContain('landing.system.dirtyClean')
    })

    it('renders formatted uptime', () => {
      const wrapper = mount(SystemInfoCard, {
        props: { system: fixture, status: 'loaded' },
      })
      // uptimeSeconds=90 → "1m"
      expect(wrapper.html()).toContain('1m')
    })

    it('renders goroutines count', () => {
      const wrapper = mount(SystemInfoCard, {
        props: { system: fixture, status: 'loaded' },
      })
      expect(wrapper.html()).toContain('42')
    })

    it('renders formatted memory', () => {
      const wrapper = mount(SystemInfoCard, {
        props: { system: fixture, status: 'loaded' },
      })
      expect(wrapper.html()).toContain('128.0 MB')
    })

    it('renders pid', () => {
      const wrapper = mount(SystemInfoCard, {
        props: { system: fixture, status: 'loaded' },
      })
      expect(wrapper.html()).toContain('1234')
    })

    it('renders primaryAddr in mono', () => {
      const wrapper = mount(SystemInfoCard, {
        props: { system: fixture, status: 'loaded' },
      })
      const monos = wrapper.findAll('.mono')
      const texts = monos.map((m) => m.text())
      expect(texts).toContain('0.0.0.0:8080')
    })

    it('renders assembly cells joined', () => {
      const wrapper = mount(SystemInfoCard, {
        props: { system: fixture, status: 'loaded' },
      })
      expect(wrapper.html()).toContain('accesscore, auditcore')
    })

    it('renders hostname', () => {
      const wrapper = mount(SystemInfoCard, {
        props: { system: fixture, status: 'loaded' },
      })
      expect(wrapper.html()).toContain('gocell-node-1')
    })
  })
})
