import { test as base, expect } from '@playwright/test';

// Every test gets an isolated context. Block writes even if validation regresses.
export const test = base.extend<{ readOnlySite: void }>({
  readOnlySite: [async ({ context }, use) => {
    await context.route('**/*', async route => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
        await route.continue();
      } else {
        await route.abort('blockedbyclient');
      }
    });
    await use();
  }, { auto: true }],
});

export { expect };
