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

  test('Javascript function: isBubbleFile', async ({ page }) => {
    // Test valid Bubble S3 URLs
    expect(await page.evaluate(() => isBubbleFile('//s3.amazonaws.com/app/file.txt'))).toBe(true);
    expect(await page.evaluate(() => isBubbleFile('https://example.s3.amazonaws.com/file.pdf'))).toBe(true);

    // Test valid Bubble CDN URLs
    expect(await page.evaluate(() => isBubbleFile('https://d1muf25xaso8hp.cdn.bubble.io/f12345/image.png'))).toBe(true);

    // Test valid image files (which pass because of isImageFile)
    expect(await page.evaluate(() => isBubbleFile('https://example.com/image.jpg'))).toBe(true);
    expect(await page.evaluate(() => isBubbleFile('https://example.com/photo.png?size=large'))).toBe(true);

    // Test invalid URLs
    expect(await page.evaluate(() => isBubbleFile('https://example.com/document.pdf'))).toBe(false);
    expect(await page.evaluate(() => isBubbleFile('https://example.com/'))).toBe(false);
    expect(await page.evaluate(() => isBubbleFile('just a regular string'))).toBe(false);

    // Test non-string inputs
    expect(await page.evaluate(() => isBubbleFile(null))).toBe(false);
    expect(await page.evaluate(() => isBubbleFile(undefined))).toBe(false);
    expect(await page.evaluate(() => isBubbleFile(123))).toBe(false);
    expect(await page.evaluate(() => isBubbleFile({}))).toBe(false);
  });
});
