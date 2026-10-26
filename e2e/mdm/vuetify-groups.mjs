/** Exercise the same Vuetify menu interaction as a browser user. */
export async function chooseGroupOption(page, combobox, title) {
  await combobox.last().click()
  await page.getByRole('option', { name: title, exact: true }).click()
}

/** The definition receipt and published member set have distinct task identities. */
export async function publishedGroup(api, settled, receipt) {
  await settled(receipt.statusUrl)
  for (let attempt = 0; attempt < 60; attempt++) {
    const value = await api(`/api/v1/groups/${receipt.target}`)
    if (value.freshness === 'current' && value.memberSet) return value
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Group member publication did not settle')
}
