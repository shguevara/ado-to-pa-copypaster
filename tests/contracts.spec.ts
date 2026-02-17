import { test, expect } from './fixtures/extension';

test('GET_SETTINGS returns AppSettings shape', async ({ extensionPage }) => {
  const result = await extensionPage.evaluate(async () => {
    return await chrome.runtime.sendMessage({ action: 'GET_SETTINGS' });
  });

  expect(result).toHaveProperty('settings');
  expect(result.settings).toHaveProperty('mappings');
  expect(Array.isArray(result.settings.mappings)).toBeTruthy();
  expect(result.settings).toHaveProperty('overwriteMode');
});
