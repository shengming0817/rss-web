import { expect, test } from '@playwright/test'

test.describe('RSS Web foundation', () => {
  test('renders the neutral shell without backend traffic', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => {
      if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
        requests.push(request.url())
      }
    })

    await page.goto('/')
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('RSS Web')
    expect(requests).toEqual([])
  })

  test('toggles the theme', async ({ page }) => {
    await page.goto('/')
    const before = await page.locator('html').getAttribute('data-theme')
    await page.getByTestId('theme-toggle').click()
    await expect.poll(() => page.locator('html').getAttribute('data-theme')).not.toBe(before)
  })
})
