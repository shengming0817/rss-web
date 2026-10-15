import './__tests__/setup'
import { expect, it } from 'vitest'
import { mount, DOMWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'
import * as Ui from './index'
it('preserves semantic content and optional layout composition', async () => {
  const wrapper = mount(
    defineComponent({
      components: { ...Ui },
      template: `<UiSurface label="Section"><UiGrid><UiStack><UiText as="h2" size="lg">Heading</UiText><UiText muted size="sm">Help</UiText><UiText>Body</UiText><UiDivider /><UiIcon label="Symbol" :size="24"><svg /></UiIcon><UiIcon><svg /></UiIcon></UiStack></UiGrid></UiSurface>`,
    }),
  )
  expect(wrapper.get('section').attributes('aria-label')).toBe('Section')
  expect(wrapper.get('h2').text()).toBe('Heading')
  expect(wrapper.get('[role=img]').attributes('aria-label')).toBe('Symbol')
  expect(wrapper.find('[aria-hidden=true]').exists()).toBe(true)
  const stack = mount(Ui.UiStack, {
    props: { direction: 'row', wrap: true, align: 'center', gap: '2' },
    slots: { default: '<button>Action</button>' },
  })
  expect(stack.get('button').text()).toBe('Action')
  expect(stack.attributes('style')).toContain('wrap')
})
it('announces messages deliberately and distinguishes unknown from success', async () => {
  const badge = mount(Ui.UiBadge, { slots: { default: 'Unknown' } })
  expect(badge.text()).toBe('Unknown')
  const message = mount(Ui.UiMessage, {
    props: { title: 'Notice' },
    slots: { default: 'Details', actions: '<button>Retry</button>' },
  })
  expect(message.get('[role=status]').text()).toContain('Details')
  await message.setProps({ tone: 'danger' })
  expect(message.get('[role=alert]').text()).toContain('Notice')
  await message.setProps({ announce: false })
  expect(message.attributes('role')).toBeUndefined()
  const titleOnly = mount(Ui.UiMessage, { props: { title: 'Quiet', announce: false } })
  expect(titleOnly.text()).toBe('Quiet')
})
it('exposes indeterminate progress, active step and useful empty-state actions', async () => {
  const progress = mount(Ui.UiProgress, { props: { label: 'Progress' } })
  expect(progress.get('progress').attributes('value')).toBeUndefined()
  await progress.setProps({ value: 30, max: 60 })
  expect(progress.get('progress').element.position).toBe(0.5)
  const steps = mount(Ui.UiStepIndicator, {
    props: { label: 'Steps', steps: ['First', 'Second', 'Last'], current: 1 },
  })
  expect(steps.get('[aria-current=step]').text()).toContain('Second')
  const spinner = mount(Ui.UiSpinner, { props: { label: 'Loading' } })
  expect(spinner.get('[role=status]').text()).toBe('Loading')
  const skeleton = mount(Ui.UiSkeleton)
  expect(skeleton.attributes('aria-hidden')).toBe('true')
  const empty = mount(Ui.UiEmptyState, {
    props: { title: 'Empty', description: 'Try another search' },
    slots: { default: '<button>Reset</button>', icon: '<span>○</span>' },
  })
  expect(empty.get('h3').text()).toBe('Empty')
  expect(new DOMWrapper(empty.element).get('button').text()).toBe('Reset')
  await empty.setProps({ description: '' })
  expect(empty.find('p').exists()).toBe(false)
})
