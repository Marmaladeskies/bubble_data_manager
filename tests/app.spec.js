const { test, expect } = require('@playwright/test');

test.describe('Bubble Data Manager Testing', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Bubble API endpoints to prevent hanging during initialization
    await page.route('**/api/1.1/meta', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          get: [{ name: "User" }],
          types: {
            User: {
              display: "User",
              fields: [
                { id: "Name", display: "Name", type: "text" },
                { id: "_id", display: "Unique ID", type: "text" },
                { id: "Created Date", display: "Created Date", type: "date" },
                { id: "Modified Date", display: "Modified Date", type: "date" }
              ]
            }
          }
        })
      });
    });

    await page.route('**/api/1.1/wf/get-options', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: {} })
      });
    });

    await page.route('**/api/1.1/obj/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { cursor: 0, count: 0, remaining: 0, results: [] } })
      });
    });

    // Navigate to page first, but we want to intercept early so we can set localStorage before it initializes fully.
    // We add an init script to populate localStorage before the app runs its initialization logic.
    await page.addInitScript(() => {
      window.localStorage.setItem('home', 'https://example-bubble-app.com');
      window.localStorage.setItem('cached_pref', 'fake-api-key');
      window.localStorage.setItem('current_app_index', '1');
    });

    await page.goto('http://localhost:3000/bubble_data_manager.html');
  });

  test('Page loads and initializes without hanging', async ({ page }) => {
    // Check title
    await expect(page).toHaveTitle(/Bubble Data Manager/);

    // Verify the app selector is visible and has our mocked app
    const appSelector = page.locator('#app-selector');
    await expect(appSelector).toBeVisible();

    // Verify the data type selector populated with the mocked 'User' type
    const dataTypeSelector = page.locator('#data-type-selector');
    await expect(dataTypeSelector).toBeAttached();
    // The data type selector might be initially hidden.
    await expect(dataTypeSelector.locator('option[value="User"]')).toHaveCount(1);
  });

  test('Javascript function: getAppStorageKeys', async ({ page }) => {
    const keys1 = await page.evaluate(() => getAppStorageKeys(1));
    expect(keys1).toEqual({ domain: 'home', apiKey: 'cached_pref' });

    const keys2 = await page.evaluate(() => getAppStorageKeys(2));
    expect(keys2).toEqual({ domain: 'home2', apiKey: 'api2' });

    const keys5 = await page.evaluate(() => getAppStorageKeys(5));
    expect(keys5).toEqual({ domain: 'home5', apiKey: 'api5' });
  });

  test('Javascript function: getAllApps', async ({ page }) => {
    // Add a second app to localStorage
    await page.evaluate(() => {
      window.localStorage.setItem('home2', 'https://another-app.com');
      window.localStorage.setItem('api2', 'another-key');
    });

    const allApps = await page.evaluate(() => getAllApps());

    expect(allApps.length).toBe(2);
    expect(allApps[0]).toEqual({ index: 1, domain: 'https://example-bubble-app.com', apiKey: 'fake-api-key' });
    expect(allApps[1]).toEqual({ index: 2, domain: 'https://another-app.com', apiKey: 'another-key' });
  });
});

test.describe('Timezone utility function tests', () => {
  // Helper to load the page in a specific timezone context and extract the label
  async function getLabelInTimezone(browser, timezoneId) {
    const context = await browser.newContext({ timezoneId });
    const tzPage = await context.newPage();

    // We only need the JS function to be available, so we just load the HTML.
    // Setting up the mocks isn't strictly necessary since we aren't initializing
    // the whole app, but for consistency we'll load the file.
    await tzPage.goto('http://localhost:3000/bubble_data_manager.html');

    const label = await tzPage.evaluate(() => getLocalTimeZoneLabel());
    await context.close();
    return label;
  }

  test('UTC timezone', async ({ browser }) => {
    const label = await getLabelInTimezone(browser, 'UTC');
    expect(label).toBe('Local Time: UTC (UTC+00:00)');
  });

  test('Positive offset timezone (Asia/Tokyo)', async ({ browser }) => {
    const label = await getLabelInTimezone(browser, 'Asia/Tokyo');
    expect(label).toBe('Local Time: Asia/Tokyo (UTC+09:00)');
  });

  test('Negative offset timezone (Pacific/Honolulu)', async ({ browser }) => {
    const label = await getLabelInTimezone(browser, 'Pacific/Honolulu');
    expect(label).toBe('Local Time: Pacific/Honolulu (UTC-10:00)');
  });

  test('Fractional offset timezone (Asia/Kolkata)', async ({ browser }) => {
    const label = await getLabelInTimezone(browser, 'Asia/Kolkata');
    // Note: Some Chromium versions map 'Asia/Kolkata' to 'Asia/Calcutta' internally.
    expect(label).toMatch(/Local Time: Asia\/(Kolkata|Calcutta) \(UTC\+05:30\)/);
  });

  test('Fallback behavior when Intl is unavailable', async ({ browser }) => {
    const context = await browser.newContext();
    const tzPage = await context.newPage();

    await tzPage.goto('http://localhost:3000/bubble_data_manager.html');

    const label = await tzPage.evaluate(() => {
      // Mock Intl to throw an error
      const originalIntl = window.Intl;
      window.Intl = {
        DateTimeFormat: () => {
          throw new Error('Intl not supported');
        }
      };

      const result = getLocalTimeZoneLabel();

      // Restore Intl
      window.Intl = originalIntl;
      return result;
    });

    await context.close();

    expect(label).toBe('Local Browser Timezone');
  });
});
