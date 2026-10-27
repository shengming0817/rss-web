import assert from 'node:assert/strict'

export const optionStartingWith = (text) =>
  new RegExp('^' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\s|$)')

async function visibleOption(page, control, name) {
  await control.focus()
  await control.press('ArrowDown')
  const listId = await control.getAttribute('aria-controls')
  const list = listId ? page.locator(`[id=${JSON.stringify(listId)}]`) : page.getByRole('listbox')
  const option = list.getByRole('option', { name, exact: typeof name === 'string' })
  await option.waitFor({ state: 'visible' })
  return option
}

/** Operate the rendered Vuetify listbox; native selectOption cannot select VSelect items. */
export async function chooseSoftwareOption(page, control, name) {
  const option = await visibleOption(page, control, name)
  await option.click()
}

/** Assert the selected visible item without reading component state or hidden input values. */
export async function assertSoftwareOption(page, control, name) {
  const option = await visibleOption(page, control, name)
  assert.equal(await option.getAttribute('aria-selected'), 'true')
  await control.press('Escape')
}
