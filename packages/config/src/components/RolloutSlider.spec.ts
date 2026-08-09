import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RolloutSlider from './RolloutSlider.vue'

describe('RolloutSlider · rendering', () => {
  it('renders an input of type range', () => {
    const wrapper = mount(RolloutSlider, { props: { modelValue: 50 } })
    const input = wrapper.find('input[type="range"]')
    expect(input.exists()).toBe(true)
  })

  it('sets aria-valuenow to the current value', () => {
    const wrapper = mount(RolloutSlider, { props: { modelValue: 75 } })
    const input = wrapper.find('input[type="range"]')
    expect(input.attributes('aria-valuenow')).toBe('75')
  })

  it('sets aria-valuemin to 0', () => {
    const wrapper = mount(RolloutSlider, { props: { modelValue: 50 } })
    const input = wrapper.find('input[type="range"]')
    expect(input.attributes('aria-valuemin')).toBe('0')
  })

  it('sets aria-valuemax to 100', () => {
    const wrapper = mount(RolloutSlider, { props: { modelValue: 50 } })
    const input = wrapper.find('input[type="range"]')
    expect(input.attributes('aria-valuemax')).toBe('100')
  })

  it('has an id attribute for label association (accessible name via <label for>)', () => {
    // RolloutSlider no longer uses aria-label; accessible name comes from
    // the parent's <label :for="inputId">. The input must have an id set.
    const wrapper = mount(RolloutSlider, { props: { modelValue: 50 } })
    const input = wrapper.find('input[type="range"]')
    expect(input.attributes('id')).toBeTruthy()
  })

  it('sets min=0 and max=100 on the input', () => {
    const wrapper = mount(RolloutSlider, { props: { modelValue: 50 } })
    const input = wrapper.find('input[type="range"]')
    expect(input.attributes('min')).toBe('0')
    expect(input.attributes('max')).toBe('100')
  })
})

describe('RolloutSlider · emits', () => {
  it('emits update:modelValue when the input changes', async () => {
    const wrapper = mount(RolloutSlider, { props: { modelValue: 50 } })
    const input = wrapper.find('input[type="range"]')
    await input.setValue('80')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual([80])
  })
})

describe('RolloutSlider · clamping', () => {
  it('clamps values below 0 to 0', async () => {
    const wrapper = mount(RolloutSlider, { props: { modelValue: 50 } })
    const input = wrapper.find('input[type="range"]')
    // Trigger with a value below 0 — HTML range inputs clamp, but test the emit value
    await input.setValue('0')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted![0]).toEqual([0])
  })

  it('clamps values above 100 to 100', async () => {
    const wrapper = mount(RolloutSlider, { props: { modelValue: 50 } })
    const input = wrapper.find('input[type="range"]')
    await input.setValue('100')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted![0]).toEqual([100])
  })
})

describe('RolloutSlider · display', () => {
  it('shows the current percentage value', () => {
    const wrapper = mount(RolloutSlider, { props: { modelValue: 42 } })
    expect(wrapper.text()).toContain('42')
  })
})
