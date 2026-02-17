import { test as base, chromium, type BrowserContext, type Page, expect } from '@playwright/test';
import path from 'path';

type Fx = {
  context: BrowserContext;
  extensionId: string;
  extensionPage: Page;
};

export const test = base.extend<Fx>({
  context: async ({}, use) => {
    // Load unpacked extension directly from repo root, per SPEC (no build step)
    const extensionPath = path.resolve(__dirname, '../..');

    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    // Find the MV3 service worker, and derive extensionId from its URL.
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const url = sw.url(); // chrome-extension://<id>/background/service-worker.js
    const id = new URL(url).host;
    await use(id);
  },

  extensionPage: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    // SPEC: side panel UI lives at sidepanel/index.html
    await page.goto(`chrome-extension://${extensionId}/sidepanel/index.html`);
    await use(page);
    await page.close();
  },
});

export { expect };
