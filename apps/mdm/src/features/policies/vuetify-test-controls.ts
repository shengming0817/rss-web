import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
type SelectWrapper = VueWrapper<{
  $props: { items: { title?: string; value: unknown }[]; modelValue: unknown }
}>
type Scope = Pick<DOMWrapper<Element>, 'findAllComponents'>
/** Domain fixtures interact through Vuetify's public model contract. */
export function selectControl(scope: Scope, selector?: string): SelectWrapper {
  selector = selector?.replace(/\bselect\b/g, 'input[role=combobox]')
  const controls = scope.findAllComponents({ name: 'VSelect' })
  const control = controls.find(
    (component: VueWrapper) =>
      !selector || component.find(selector).exists() || component.element.matches(selector),
  )
  if (!control) throw new Error(`Missing select control ${selector ?? ''}`)
  return control as unknown as SelectWrapper
}
export function hasChoice(control: VueWrapper, value: unknown): boolean {
  return (
    (control.props() as { items: { value?: unknown }[] }).items as { value?: unknown }[]
  ).some((item) => item.value === value)
}
