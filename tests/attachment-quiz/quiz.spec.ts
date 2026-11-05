import { test, expect } from '../fixtures';
import { answer, beginQuiz, completeQuiz, expectScores, openIntake, openSharedResult,
  readyQuestion, savedQuizKeys, sharedResult } from './quiz';

test('homepage introduces the four styles and opens the age gate', async ({ page }, testInfo) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/What’s your attachment style\?/);
  for (const style of ['Secure', 'Anxious-Preoccupied', 'Dismissive-Avoidant', 'Fearful-Avoidant']) {
    await expect(page.getByRole('heading', { name: style, exact: true })).toBeVisible();
  }
  await testInfo.attach('Attachment quiz homepage', {
    body: await page.screenshot({ fullPage: true, animations: 'disabled' }), contentType: 'image/png',
  });
  await page.getByRole('link', { name: 'Discover my style', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Yes, I’m 18 or older' })).toBeVisible();
});

test('under-18 visitors receive an exit without saved quiz data', async ({ page }) => {
  await page.goto('/start');
  await page.getByRole('button', { name: 'I’m under 18', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'There’s no rush to figure it all out.' })).toBeVisible();
  expect(await savedQuizKeys(page)).toEqual([]);
  await page.getByRole('link', { name: 'Return home' }).click();
  await expect(page).toHaveURL(/\/$/);
});

for (const missing of ['age', 'consent']) {
  test(`requires ${missing} and begins after correction`, async ({ page }) => {
    await openIntake(page);
    if (missing !== 'age') await page.getByLabel('Age range').selectOption('25–34');
    if (missing !== 'consent') await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Begin my quiz' }).click();
    await expect(page).toHaveURL(/\/start$/);
    const field = missing === 'age' ? page.getByLabel('Age range') : page.getByRole('checkbox');
    expect(await field.evaluate((element: HTMLInputElement | HTMLSelectElement) => element.validity.valueMissing)).toBe(true);
    expect(await savedQuizKeys(page)).toEqual([]);
    if (missing === 'age') await field.selectOption('25–34');
    else {
      // Keyboard activation avoids Firefox's native validation-bubble click
      // handling after an invalid form submission.
      await field.focus();
      await page.keyboard.press('Space');
      await expect(field).toBeChecked();
    }
    await page.getByRole('button', { name: 'Begin my quiz' }).click();
    await readyQuestion(page, 0);
  });
}

for (const { path, heading, link } of [
  { path: '/quiz', heading: 'Your next moment of insight.', link: 'Start the quiz' },
  { path: '/result', heading: 'Your reflections start here.', link: 'Take my own quiz' },
]) {
  test(`${path} offers a start link in a fresh browser`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: link })).toHaveAttribute('href', '/start');
  });
}

test('saves progress, resumes after reload and exit, and allows answer correction', async ({ page }) => {
  await beginQuiz(page);
  const firstQuestion = await page.getByRole('heading', { level: 1 }).innerText();
  await answer(page, 2);
  await readyQuestion(page, 1);
  const secondQuestion = await page.getByRole('heading', { level: 1 }).innerText();
  await page.reload();
  await readyQuestion(page, 1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(secondQuestion);
  await page.getByRole('button', { name: 'Save & exit' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: 'Discover my style', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, I’m 18 or older' }).click();
  await expect(page.getByLabel('Age range')).toHaveValue('25–34');
  await expect(page.getByRole('checkbox')).toBeChecked();
  await page.getByRole('button', { name: 'Continue my quiz' }).click();
  await readyQuestion(page, 1);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await readyQuestion(page, 0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(firstQuestion);
  await expect(page.getByRole('radio', { name: '2: Disagree', exact: true })).toBeChecked();
  await answer(page, 4);
  await readyQuestion(page, 1);
  await page.getByRole('button', { name: 'All questions', exact: true }).click();
  const navigation = page.getByRole('navigation', { name: 'Jump to a question' });
  await expect(navigation.getByRole('button')).toHaveCount(24);
  await expect(navigation.getByRole('button', { name: 'Question 1, answered 4, Agree', exact: true })).toBeEnabled();
  await expect(navigation.getByRole('button', { name: 'Question 3, not answered', exact: true })).toBeDisabled();
  await navigation.getByRole('button', { name: 'Question 1, answered 4, Agree', exact: true }).click();
  await readyQuestion(page, 0);
  await expect(page.getByRole('radio', { name: '4: Agree', exact: true })).toBeChecked();
});

test('supports arrow-key focus, numeric answers, and keyboard back navigation', async ({ page }) => {
  await beginQuiz(page);
  await page.getByRole('radio', { name: '1: Strongly disagree', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: '2: Disagree', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await readyQuestion(page, 1);
  await page.keyboard.press('3');
  await readyQuestion(page, 2);
  await page.keyboard.press('ArrowLeft');
  await readyQuestion(page, 1);
  await expect(page.getByRole('radio', { name: '3: Neutral', exact: true })).toBeChecked();
});

for (const { anxiety, avoidance, style } of [
  { anxiety: 1, avoidance: 1, style: 'Secure' },
  { anxiety: 5, avoidance: 1, style: 'Anxious-Preoccupied' },
  { anxiety: 1, avoidance: 5, style: 'Dismissive-Avoidant' },
  { anxiety: 5, avoidance: 5, style: 'Fearful-Avoidant' },
]) {
  test(`scores all 24 randomized questions as ${style}, including reversed items`, async ({ page }, testInfo) => {
    await beginQuiz(page);
    await completeQuiz(page, anxiety, avoidance);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(style);
    await expectScores(page, anxiety.toFixed(2), avoidance.toFixed(2));
    await expect(page.getByRole('img', { name: `Your attachment map: anxiety ${anxiety.toFixed(2)}, avoidance ${avoidance.toFixed(2)}. ${style}.`, exact: true })).toBeVisible();
    expect(await savedQuizKeys(page)).toContain('asq.result');
    expect(await savedQuizKeys(page)).not.toContain('asq.progress');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(style);
    await expectScores(page, anxiety.toFixed(2), avoidance.toFixed(2));
    await testInfo.attach(`${style} result`, {
      body: await page.screenshot({ fullPage: true, animations: 'disabled' }), contentType: 'image/png',
    });
  });
}

test('neutral answers classify at the midpoint and reviewing an answer recalculates scores', async ({ page }) => {
  await beginQuiz(page, true);
  await completeQuiz(page, 3, 3);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fearful-Avoidant');
  await expectScores(page, '3.00', '3.00');
  await expect(page.getByText('Your scores sit near the centre, so you may relate to several attachment patterns.')).toBeVisible();
  await expect(page.getByText('Portfolio Tester, your primary style is')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'In long-term relationships', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Copy result link', exact: true }).click();
  const url = new URL(await page.getByLabel('Shareable score link').inputValue());
  const payload = JSON.parse(Buffer.from(url.hash.slice(3), 'base64url').toString());
  expect(payload).toEqual({ version: 1, anxiety: 3, avoidance: 3 });
  await page.getByRole('button', { name: 'Review my answers', exact: true }).click();
  await readyQuestion(page, 23);
  await answer(page, 4);
  await expect(page).toHaveURL(/\/result$/);
  // Order alternates dimensions and ends with avoidance; a one-point change
  // moves that mean by 1/12 (up or down for a reversed statement).
  await expect(page.getByRole('progressbar', { name: 'Attachment anxiety', exact: true })).toHaveAttribute('aria-valuetext', /^3\.00 out of 5,/);
  await expect(page.getByRole('progressbar', { name: 'Attachment avoidance', exact: true })).toHaveAttribute('aria-valuetext', /^(2\.92|3\.08) out of 5,/);
  await expect(page.getByRole('heading', { name: 'How your scores shifted.' })).toBeVisible();
  await page.getByRole('button', { name: 'Retake quiz', exact: true }).click();
  await expect(page).toHaveURL(/\/start$/);
  expect(await savedQuizKeys(page)).toEqual([]);
});

test('shared result leaves the recipients saved progress unchanged', async ({ page }) => {
  await beginQuiz(page);
  await answer(page, 2);
  await readyQuestion(page, 1);
  const before = await page.evaluate(() => localStorage.getItem('asq.progress'));
  await openSharedResult(page, 5, 1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Anxious-Preoccupied');
  await expectScores(page, '5.00', '1.00');
  expect(await page.evaluate(() => localStorage.getItem('asq.progress'))).toBe(before);
  expect(await savedQuizKeys(page)).not.toContain('asq.result');
  await expect(page.getByRole('button', { name: 'Review my answers', exact: true })).toHaveCount(0);
  await page.goto('/quiz');
  await readyQuestion(page, 1);
});

for (const fragment of ['not-a-result', Buffer.from(JSON.stringify({ version: 1, anxiety: 6, avoidance: 1 })).toString('base64url')]) {
  test(`rejects invalid shared result ${fragment === 'not-a-result' ? 'encoding' : 'scores'}`, async ({ page }) => {
    await page.goto(`/result#r=${fragment}`);
    await expect(page.getByRole('heading', { name: 'This result link doesn’t look quite right.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Take my own quiz' })).toHaveAttribute('href', '/start');
    expect(await savedQuizKeys(page)).toEqual([]);
  });
}

test('near-midpoint score shows the neighbouring pattern', async ({ page }) => {
  await openSharedResult(page, 2.75, 1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Secure');
  await expect(page.getByText('Your primary style is Secure, with some traits of Anxious-Preoccupied.')).toBeVisible();
});

test('result tabs, scenarios, and partner dynamics update their content', async ({ page }) => {
  await openSharedResult(page);
  await page.getByRole('tab', { name: 'In dating', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'In long-term relationships', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'In long-term relationships', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'A disagreement heats up', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A disagreement heats up', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'A disagreement heats up', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('group', { name: 'Their style', exact: true }).getByRole('button', { name: 'Anxious', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Secure + Anxious: Steadying presence', exact: true })).toBeVisible();
  await page.getByLabel('Or paste their shared link').fill('invalid');
  await page.getByRole('button', { name: 'Read link', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'That link does not look like a valid shared result.' })).toBeVisible();
  await page.getByLabel('Or paste their shared link').fill(sharedResult(1, 5));
  await page.getByRole('button', { name: 'Read link', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Secure + Avoidant: Patient bridge', exact: true })).toBeVisible();
});

test('downloads a PNG result card', async ({ page }, testInfo) => {
  await openSharedResult(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download result card', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('my-attachment-style.png');
  const path = testInfo.outputPath('my-attachment-style.png');
  await download.saveAs(path);
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1350);
  await testInfo.attach('Downloaded result card', { path, contentType: 'image/png' });
});

test('display preferences persist and clear-data removes quiz information and fragments', async ({ page }) => {
  await beginQuiz(page);
  await page.getByRole('button', { name: 'Display options: text size and contrast' }).click();
  await page.getByRole('button', { name: 'Largest text', exact: true }).click();
  await page.getByRole('button', { name: 'High contrast', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.reload();
  await readyQuestion(page, 0);
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'larger');
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await openSharedResult(page);
  await page.getByRole('navigation', { name: 'Footer', exact: true }).getByRole('button', { name: 'Clear my data', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await savedQuizKeys(page)).toEqual([]);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'normal');
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'normal');
  await page.goto('/quiz');
  await expect(page.getByRole('heading', { name: 'Your next moment of insight.' })).toBeVisible();
});

test('about and privacy links explain scoring and local data storage', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'About the quiz', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'How your scores are calculated', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Read the Privacy Notice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your reflections belong to you.', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What stays in your browser', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Powered by MTech Corp (opens in a new tab)', exact: true })).toHaveAttribute('href', 'https://mtechcorpja.com/');
});

test('home, intake, questions, and results fit within the viewport', async ({ page }) => {
  const fits = async () => expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.goto('/');
  await fits();
  await openIntake(page);
  await fits();
  await beginQuiz(page);
  await fits();
  await openSharedResult(page);
  await fits();
});
