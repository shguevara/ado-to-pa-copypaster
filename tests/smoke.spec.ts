import { test, expect } from './fixtures/extension';

test('side panel loads', async ({ extensionPage }) => {
  await expect(extensionPage.locator('body')).toBeVisible();
});
