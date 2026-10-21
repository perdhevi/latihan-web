import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

/*
 * One user's whole life in the app, against the real API: sign up, create a
 * profile, a plan, a session from it, see planned versus done and the
 * dashboard, export the data, erase the account. The account is new each
 * run and erased at the end.
 *
 * Any console error, page error or Content-Security-Policy violation fails
 * the test: the production CSP must not break the app.
 */

function watchForProblems(page: Page) {
  const problems: string[] = []
  page.on('console', (message) => {
    // The API's 4xx answers are part of the journey (the sign-in after the
    // erase is meant to fail); the browser logs failed requests as errors.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
      problems.push(message.text())
    }
  })
  page.on('pageerror', (error) => problems.push(error.message))
  return problems
}

async function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])
}

test('a new user, from sign-up to erasing the account', async ({ page }) => {
  const problems = watchForProblems(page)
  await page.addInitScript(() => {
    const seen: string[] = []
    ;(window as unknown as { __csp: string[] }).__csp = seen
    document.addEventListener('securitypolicyviolation', (event) =>
      seen.push(`${event.violatedDirective} ${event.blockedURI}`),
    )
  })
  // Test values, made for this run; the account is erased at the end.
  const email = `e2e-${Date.now()}@example.test`
  const password = `e2e-${crypto.randomUUID()}`

  // Sign up, from a deep link that needs a session.
  await page.goto('/plans')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()

  // The profile, then back to the page asked for.
  await page.getByLabel('Display name').fill('E2E Runner')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Plans' })).toBeVisible()

  // A plan with a catalog exercise.
  await page.getByRole('link', { name: 'New plan' }).click()
  await page.getByLabel('Plan name').fill('E2E legs')
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await page.getByRole('button', { name: 'Add Front Squat' }).click()
  const planSet = page.getByRole('group', { name: 'Exercise 1' }).getByRole('group', { name: 'Set 1' })
  await planSet.getByLabel('Reps').fill('5')
  await planSet.getByLabel('Weight (kg)').fill('60')
  await page.getByRole('button', { name: 'Save plan' }).click()
  await expect(page.getByRole('link', { name: /E2E legs/ })).toBeVisible()

  // A session from it: log the target, do one rep more, survive a reload.
  await page.getByRole('link', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Start a new session' }).click()
  await page.getByRole('dialog', { name: 'Start from a plan?' }).getByRole('button', { name: /E2E legs/ }).click()
  await page.getByRole('button', { name: 'Log Front Squat' }).click()
  const sessionSet = page.getByRole('group', { name: 'Exercise 1' }).getByRole('group', { name: 'Set 1' })
  await sessionSet.getByLabel('Reps').fill('6')
  await page.reload()
  await expect(sessionSet.getByLabel('Reps')).toHaveValue('6')
  await page.getByRole('button', { name: 'Finish session' }).click()

  // Planned versus done, from the server's comparison.
  await expect(page.getByRole('heading', { name: 'Planned versus done' })).toBeVisible()
  const reps = page.getByRole('table', { name: 'Totals' }).getByRole('row', { name: /^Reps/ })
  await expect(reps.getByRole('cell')).toHaveText(['5', '6', '+1'])

  // The dashboard counts it.
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.locator('.tiles dd').first()).toHaveText('1')
  await expect(page.getByRole('img', { name: /Line chart/ })).toBeVisible()

  // Export: the server's document, under the server's name.
  await page.getByRole('link', { name: 'Profile' }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export my data' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('latihan-export.json')
  const exported = JSON.parse(await readFile(await download.path(), 'utf-8'))
  expect(exported).toMatchObject({ format: 'latihan-export/1', user: { display_name: 'E2E Runner' } })
  expect(exported.plans).toHaveLength(1)
  expect(exported.sessions).toHaveLength(1)

  // Erase, and the login is gone.
  await page.getByRole('button', { name: 'Erase my account' }).click()
  const dialog = page.getByRole('dialog', { name: 'Erase your account?' })
  await dialog.getByLabel('Type ERASE to confirm').fill('ERASE')
  await dialog.getByRole('button', { name: 'Erase my account' }).click()
  await expect(page.getByText('Your account and its data were erased.')).toBeVisible()
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/sign-in$/)

  expect(await cspViolations(page)).toEqual([])
  expect(problems).toEqual([])
})
