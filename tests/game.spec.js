import { test, expect } from '@playwright/test';

const V2 = 'captable-progress-v2';
const read = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), V2);

async function answerAll(page, { count = 10, pick = 0 } = {}) {
  for (let i = 0; i < count; i++) {
    const n = await page.locator('.choice').count();
    await page.locator('.choice').nth(pick % n).click();
    await expect(page.locator('.sheet')).toBeVisible();
    await page.locator('.sheet .btn.primary').click();
  }
}

test('first run: calibration is offered, a sprint completes, recap and progress persist', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByRole('button', { name: /Calibrate in 6 questions/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: /Skip and start a sprint/ }).click();
  await expect(page.locator('.prompt')).toBeVisible();
  expect(await page.locator('.choice').count()).toBeGreaterThanOrEqual(2);
  await answerAll(page);
  await expect(page.getByText(/points/).first()).toBeVisible();
  await expect(page.getByText('First round closed')).toBeVisible();
  const data = await read(page);
  expect(data.v).toBe(2);
  expect(data.total).toBe(10);
  expect(data.sessions).toBe(1);
  expect(data.recent[0].mode).toBe('sprint');
  await page.reload();
  await expect(page.getByRole('button', { name: /^Sprint/ })).toBeVisible();
  await page.getByRole('link', { name: 'Progress', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
  await expect(page.getByText('Recent rounds')).toBeVisible();
  expect(errors).toEqual([]);
});

test('explanation stays until the user continues, and shows the ownership bar', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Skip and start a sprint/ }).click();
  await page.locator('.choice').first().click();
  await expect(page.locator('.sheet')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator('.sheet')).toBeVisible();
  await expect(page.locator('.sheet .explain')).toBeVisible();
  const barOrSharePrice = await page.locator('.sheet .viz .track, .sheet .shortcut').count();
  expect(barOrSharePrice).toBeGreaterThan(0);
  await expect(page.locator('.steps i.ok, .steps i.miss')).toHaveCount(1);
});

test('typed answers validate and accept a computed answer', async ({ page }) => {
  await page.goto('./');
  await page.locator('#focus').selectOption('valuation');
  await page.getByText('Type answers instead of choosing').click();
  await expect(page.locator('#typed')).toBeChecked();
  await page.getByRole('button', { name: /^Practice/ }).click();
  await page.locator('#answer').fill('oops');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  const prompt = await page.locator('.prompt').innerText();
  const facts = await page.locator('.facts').innerText();
  let answer;
  if (/pre-money valuation does that imply/.test(prompt)) {
    const cash = Number(facts.match(/\$([\d.]+)M/)[1]);
    const own = Number(facts.match(/([\d.]+)%/)[1]);
    answer = cash / (own / 100) - cash;
  } else if (/You own/.test(prompt)) {
    const stake = Number(facts.match(/([\d.]+)%/)[1]);
    const [cash, pre] = [...facts.matchAll(/\$([\d.]+)M/g)].map((m) => Number(m[1]));
    answer = (stake * pre) / (pre + cash);
  } else {
    const [pre, cash] = [...facts.matchAll(/\$([\d.]+)M/g)].map((m) => Number(m[1]));
    answer = (100 * cash) / (pre + cash);
  }
  await page.locator('#answer').fill(answer.toFixed(2));
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.locator('.sheet.ok')).toBeVisible();
  await expect(page.locator('.sheet h2')).toHaveText(/Correct|On a run|in a row/);
});

test('timer expiry, double taps, leaving, and resuming a round', async ({ page }) => {
  await page.clock.install();
  await page.goto('./');
  await page.getByRole('button', { name: /Skip and start a sprint/ }).click();
  await page.clock.fastForward(21000);
  await expect(page.locator('.sheet h2')).toHaveText('Out of time.');
  expect((await read(page)).total).toBe(1);
  await page.locator('.sheet .btn.primary').click();
  await page.locator('.choice').first().dblclick();
  expect((await read(page)).total).toBe(2);
  await page.locator('.sheet .btn.primary').click();
  await page.getByRole('button', { name: 'Leave round' }).click();
  await expect(page.getByRole('button', { name: /Resume sprint/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /Resume sprint/ })).toBeVisible();
  await page.getByRole('button', { name: /Resume sprint/ }).click();
  await expect(page.locator('.prompt')).toBeVisible();
  await expect(page.locator('.steps i.ok, .steps i.miss')).toHaveCount(2);
  await page.getByRole('button', { name: 'Leave round' }).click();
  await page.getByRole('button', { name: 'Discard that round' }).click();
  await expect(page.getByRole('button', { name: /^Sprint/ })).toBeVisible();
});

test('deal room, revenge round, and offline availability', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.getByRole('button', { name: /Deal room/ }).click();
  await expect(page.locator('.choice')).toHaveCount(2);
  await answerAll(page, { count: 10, pick: 0 });
  await expect(page.getByText(/Deal room/).first()).toBeVisible();
  const data = await read(page);
  expect(data.recent[0].mode).toBe('deals');
  if (data.lastMisses.length) {
    await page.getByRole('button', { name: /Revenge round/ }).click();
    await expect(page.locator('.prompt')).toBeVisible();
    await expect(page.locator('.steps i')).toHaveCount(6);
    await page.getByRole('button', { name: 'Leave round' }).click();
    await page.getByRole('button', { name: 'Discard that round' }).click();
  }
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /Daily challenge/ })).toBeVisible();
  await page.getByRole('button', { name: /^Practice/ }).click();
  await expect(page.locator('.prompt')).toBeVisible();
});

test('daily challenge is the same set within a day and records a best', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Daily challenge/ }).click();
  const first = await page.locator('.prompt').innerText();
  await page.getByRole('button', { name: 'Leave round' }).click();
  await page.getByRole('button', { name: 'Discard that round' }).click();
  await page.getByRole('button', { name: /Daily challenge/ }).click();
  expect(await page.locator('.prompt').innerText()).toBe(first);
  await answerAll(page, { count: 8 });
  await expect(page.getByText(/Daily challenge/).first()).toBeVisible();
  const data = await read(page);
  const today = new Date().toLocaleDateString('en-CA');
  expect(data.dailies[today]).toBeGreaterThanOrEqual(0);
  await page.goto('./');
  await expect(page.getByText(/Done today/)).toBeVisible();
});

test('legacy v1 progress migrates and keeps the old best', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('captable-progress-v1', JSON.stringify({ total: 40, correct: 30, best: 900, sessions: 4, topics: { valuation: { total: 10, correct: 9 } }, days: ['2026-09-18'], recent: [{ score: 900, correct: 8, date: '2026-09-18', mode: 'sprint' }] }));
  });
  await page.reload();
  await expect(page.getByText('Seed', { exact: true })).toBeVisible();
  await expect(page.getByText(/best 900/)).toBeVisible();
  const data = await read(page);
  expect(data.bests.sprint.choice).toBe(900);
  expect(data.total).toBe(40);
});
