import assert from 'node:assert/strict'

export const escapePattern = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Only public DOM and accessible options: never read or mutate Vue component state. */
export function comboInput(control) {
  return control
    .locator('xpath=self::input[@role="combobox"] | .//input[@role="combobox"]')
    .filter({ visible: true })
}

export async function selectedValue(control) {
  const input = comboInput(control)
  await input.waitFor({ state: 'visible' })
  const field = input.locator(
    'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " v-select ")][1]',
  )
  return field.locator('input[type="hidden"]').inputValue()
}

async function openOptions(page, control) {
  const input = comboInput(control)
  await input.waitFor({ state: 'visible' })
  await input.locator('xpath=self::input[not(@disabled)]').waitFor({ state: 'visible' })
  if ((await input.getAttribute('aria-expanded')) !== 'true') await input.press('ArrowDown')
  const controls = await input.getAttribute('aria-controls')
  assert.ok(controls, 'Combobox must identify its public listbox')
  const menu = page.locator(`[id=${JSON.stringify(controls)}]`)
  const listbox = menu
    .locator('xpath=self::*[@role="listbox"] | .//*[@role="listbox"]')
    .filter({ visible: true })
  await listbox.waitFor({ state: 'visible' })
  return { input, listbox }
}

async function scrollOptions(listbox) {
  return listbox.evaluate((element) => {
    let scroller = element
    while (
      scroller &&
      scroller !== document.body &&
      scroller.scrollHeight <= scroller.clientHeight + 1
    )
      scroller = scroller.parentElement
    if (!scroller || scroller === document.body) return false
    const before = scroller.scrollTop
    scroller.scrollBy(0, Math.max(200, scroller.clientHeight - 30))
    return scroller.scrollTop > before
  })
}

export async function chooseOption(page, control, label, { loadMore } = {}) {
  for (let directoryPage = 0; directoryPage < 64; directoryPage++) {
    const { input, listbox } = await openOptions(page, control)
    const option = listbox
      .getByRole('option', { name: label, exact: typeof label === 'string' })
      .filter({ visible: true })
    for (let scroll = 0; scroll < 64; scroll++) {
      if (await option.count()) {
        assert.equal(await option.count(), 1, 'Selection label must identify one visible option')
        await option.click()
        await listbox.waitFor({ state: 'hidden' })
        return
      }
      if (!(await scrollOptions(listbox))) break
      await page.waitForTimeout(25)
    }
    await input.press('Escape')
    if (!loadMore || !(await loadMore.isVisible()) || !(await loadMore.isEnabled())) break
    await loadMore.click()
  }
  throw new Error('Requested visible option is unavailable in the authorized directory')
}

export async function chooseOptionAt(page, control, index) {
  const { listbox } = await openOptions(page, control)
  const option = listbox.getByRole('option').filter({ visible: true }).nth(index)
  await option.click()
  await listbox.waitFor({ state: 'hidden' })
}

export function pageAlert(page) {
  return page.locator('.console-page > .v-alert[role="alert"]').filter({ visible: true })
}

export async function waitForPageIdle(page) {
  await page.locator('.console-page:not([aria-busy="true"])').waitFor({ state: 'visible' })
}

export async function submitForm(page, selector) {
  const form = page.locator(selector)
  await form.locator('button[type="submit"]').filter({ visible: true }).click()
}
