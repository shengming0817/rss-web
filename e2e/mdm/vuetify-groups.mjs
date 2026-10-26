/** Exercise the same Vuetify menu interaction as a browser user. */
export async function chooseGroupOption(page, combobox, title) {
  await combobox.click()
  await page.getByRole('option', { name: title, exact: true }).click()
}
