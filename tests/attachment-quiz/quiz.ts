import { expect, type Page } from '@playwright/test';

// Reference questions identify dimensions despite the site's randomized order.
// The About page specifies 12 items per dimension, with two reversed in each.
const anxietyQuestions = new Set([
  'I worry that people I am close to will stop caring about me.',
  'I need frequent reassurance that I am loved.',
  'When a partner is slow to reply, I assume something is wrong.',
  'I fear being abandoned or left behind.',
  'I wish my partner were as committed to me as I am to them.',
  'I get upset when a partner needs time apart.',
  "I overanalyze small changes in a partner's tone or mood.",
  'I feel anxious when I am unsure where I stand in a relationship.',
  'I worry that I am more invested than the people I date.',
  'I sometimes feel my need for closeness scares people away.',
  'I rarely worry about whether my partner truly loves me.',
  'I feel calm in my relationships even when things are uncertain.',
]);
const avoidanceQuestions = new Set([
  'I feel uncomfortable when someone gets too emotionally close.',
  'I prefer not to share my deepest feelings with partners.',
  'I value my independence more than closeness in relationships.',
  'I pull away when conflict becomes emotional.',
  'I find it hard to depend on other people.',
  'I feel smothered when a partner wants more time together.',
  'I would rather solve problems alone than ask for support.',
  'I keep part of myself private even in close relationships.',
  'I get restless or want an exit when things start to feel serious.',
  'I tend to downplay how much I need other people.',
  'I find it easy to open up to and rely on partners.',
  'I feel comfortable being emotionally close to others.',
]);
const reversedQuestions = new Set([
  'I rarely worry about whether my partner truly loves me.',
  'I feel calm in my relationships even when things are uncertain.',
  'I find it easy to open up to and rely on partners.',
  'I feel comfortable being emotionally close to others.',
]);

export async function openIntake(page: Page) {
  await page.goto('/start');
  await page.getByRole('button', { name: 'Yes, I’m 18 or older' }).click();
  await expect(page.getByRole('heading', { name: 'Make this moment yours.' })).toBeVisible();
}

export async function beginQuiz(page: Page, personalized = false) {
  await openIntake(page);
  await page.getByLabel('Age range').selectOption('25–34');
  if (personalized) {
    await page.getByLabel('First name').fill('Portfolio Tester');
    await page.getByLabel('Relationship status').selectOption('Married');
    await page.getByLabel('What brings you here?').selectOption('Understand my patterns');
  }
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Begin my quiz' }).click();
  await readyQuestion(page, 0);
}

export async function readyQuestion(page: Page, index: number) {
  await expect(page.getByRole('progressbar', { name: 'Quiz progress', exact: true }))
    .toHaveAttribute('value', String(index));
  await expect(page.getByRole('radiogroup')).toHaveAttribute('aria-busy', 'false');
}

export async function answer(page: Page, value: number) {
  await page.getByRole('radio', { name: new RegExp(`^${value}:`) }).click();
}

export async function completeQuiz(page: Page, anxiety: number, avoidance: number) {
  const seen = new Set<string>();
  for (let index = 0; index < 24; index++) {
    await readyQuestion(page, index);
    const question = (await page.getByRole('heading', { level: 1 }).innerText()).trim();
    expect(anxietyQuestions.has(question) || avoidanceQuestions.has(question), `Known question: ${question}`).toBe(true);
    expect(seen.has(question), 'Each question appears once').toBe(false);
    seen.add(question);
    const score = anxietyQuestions.has(question) ? anxiety : avoidance;
    await answer(page, reversedQuestions.has(question) ? 6 - score : score);
  }
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByRole('region', { name: 'Your result summary' })).toBeVisible();
  expect(seen.size).toBe(24);
}

export async function expectScores(page: Page, anxiety: string, avoidance: string) {
  for (const [dimension, score] of [['anxiety', anxiety], ['avoidance', avoidance]]) {
    await expect(page.getByRole('progressbar', { name: `Attachment ${dimension}`, exact: true }))
      .toHaveAttribute('aria-valuetext', new RegExp(`^${score.replace('.', '\\.')} out of 5,`));
  }
}

// The site's documented public share format. Focused result tests use this
// route; scoring tests above always answer all questions through the UI.
export function sharedResult(anxiety: number, avoidance: number) {
  const fragment = Buffer.from(JSON.stringify({ version: 1, anxiety, avoidance })).toString('base64url');
  return `/result#r=${fragment}`;
}

export async function openSharedResult(page: Page, anxiety = 1, avoidance = 1) {
  await page.goto(sharedResult(anxiety, avoidance));
  await expect(page.getByRole('region', { name: 'Your result summary' })).toBeVisible();
}

export const savedQuizKeys = (page: Page) => page.evaluate(() =>
  Object.keys(localStorage).filter(key => key.startsWith('asq.')));
