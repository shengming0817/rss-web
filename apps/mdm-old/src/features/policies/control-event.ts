/** Bridges Vuetify model updates to the existing typed domain form handlers. */
export function controlEvent(value: unknown): Event {
  const input = document.createElement('input')
  input.value = value == null ? '' : String(value)
  input.checked = value === true
  const event = new Event('input', { bubbles: true })
  Object.defineProperty(event, 'target', { value: input })
  return event
}
