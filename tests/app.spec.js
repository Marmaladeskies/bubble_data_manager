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
  test('Javascript function: formatToDateTimeLocal', async ({ page }) => {
    // 1. Empty/null inputs
    let res = await page.evaluate(() => formatToDateTimeLocal(''));
    expect(res).toBe('');

    res = await page.evaluate(() => formatToDateTimeLocal(null));
    expect(res).toBe('');

    res = await page.evaluate(() => formatToDateTimeLocal(undefined));
    expect(res).toBe('');

    // 2. Invalid date strings
    res = await page.evaluate(() => formatToDateTimeLocal('invalid-date'));
    expect(res).toBe('');

    // 3. Valid date string requiring padding (using a local time string to avoid CI timezone differences)
    // Note: JS Date parsing of "2024-05-05T08:05:00" without Z is treated as local time.
    res = await page.evaluate(() => formatToDateTimeLocal('2024-05-05T08:05:00'));
    expect(res).toBe('2024-05-05T08:05');

    // 4. Valid date string not requiring padding
    res = await page.evaluate(() => formatToDateTimeLocal('2024-11-20T14:30:00'));
    expect(res).toBe('2024-11-20T14:30');

    // 5. Check edge cases like boundary values, if needed.
    // E.g., year with 4 digits.
    res = await page.evaluate(() => formatToDateTimeLocal('1999-01-01T00:00:00'));
    expect(res).toBe('1999-01-01T00:00');
  });

});
