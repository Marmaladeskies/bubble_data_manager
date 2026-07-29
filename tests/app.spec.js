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


  test('Javascript function: parseAllSettings', async ({ page }) => {
    // Test scenario 1: settingsRecord is null/undefined
    const result1 = await page.evaluate(() => {
      settingsRecord = null;
      return parseAllSettings();
    });
    expect(result1).toEqual({});

    // Test scenario 2: settingsRecord[DATA_MANAGER_SETTINGS_NAME] is missing/undefined
    const result2 = await page.evaluate(() => {
      settingsRecord = {};
      return parseAllSettings();
    });
    expect(result2).toEqual({});

    // Test scenario 3: valid JSON string
    const result3 = await page.evaluate(() => {
      settingsRecord = {
        [DATA_MANAGER_SETTINGS_NAME]: '{"columnOrder":["_id","Name"]}'
      };
      return parseAllSettings();
    });
    expect(result3).toEqual({ columnOrder: ["_id", "Name"] });

    // Test scenario 4: invalid JSON string (should be caught by catch block)
    const result4 = await page.evaluate(() => {
      settingsRecord = {
        [DATA_MANAGER_SETTINGS_NAME]: '{"columnOrder":["_id","Name"' // missing closing brackets
      };
      return parseAllSettings();
    });
    expect(result4).toEqual({});

    // Test scenario 5: value is already an object
    const result5 = await page.evaluate(() => {
      settingsRecord = {
        [DATA_MANAGER_SETTINGS_NAME]: { filterData: "some-data" }
      };
      return parseAllSettings();
    });
    expect(result5).toEqual({ filterData: "some-data" });
  test('Javascript function: escapeHTML', async ({ page }) => {
    // Happy path: strings with special HTML characters
    const testStrings = [
      { input: 'Tom & Jerry', expected: 'Tom &amp; Jerry' },
      { input: '<script>alert(1)</script>', expected: '&lt;script&gt;alert(1)&lt;/script&gt;' },
      { input: 'He said "Hello"', expected: 'He said &quot;Hello&quot;' },
      { input: "It's a beautiful day", expected: 'It&#039;s a beautiful day' },
      { input: '<>&"\'', expected: '&lt;&gt;&amp;&quot;&#039;' } // All together
    ];

    for (const { input, expected } of testStrings) {
      const result = await page.evaluate((val) => escapeHTML(val), input);
      expect(result).toBe(expected);
    }

    // Edge cases: non-string inputs
    const edgeCases = [
      null,
      undefined,
      123,
      true,
      { key: 'value' },
      ['array']
    ];

    for (const val of edgeCases) {
      const result = await page.evaluate((v) => escapeHTML(v), val);
      expect(result).toEqual(val);
    }
  test('Javascript function: isImageFile', async ({ page }) => {
    // Valid standard paths
    expect(await page.evaluate(() => isImageFile('image.jpg'))).toBe(true);
    expect(await page.evaluate(() => isImageFile('path/to/image.png'))).toBe(true);
    expect(await page.evaluate(() => isImageFile('https://example.com/img.webp'))).toBe(true);

    // Case insensitivity
    expect(await page.evaluate(() => isImageFile('IMAGE.JPG'))).toBe(true);
    expect(await page.evaluate(() => isImageFile('image.PNG'))).toBe(true);

    // Query parameters
    expect(await page.evaluate(() => isImageFile('image.gif?v=123'))).toBe(true);
    expect(await page.evaluate(() => isImageFile('https://example.com/img.svg?size=large'))).toBe(true);
    expect(await page.evaluate(() => isImageFile('IMAGE.JPG?v=1'))).toBe(true);

    // Hash fragments
    expect(await page.evaluate(() => isImageFile('image.jpg#top'))).toBe(true);
    expect(await page.evaluate(() => isImageFile('https://example.com/img.png#section'))).toBe(true);

    // Invalid files
    expect(await page.evaluate(() => isImageFile('document.pdf'))).toBe(false);
    expect(await page.evaluate(() => isImageFile('archive.zip'))).toBe(false);
    expect(await page.evaluate(() => isImageFile('https://example.com/page.html'))).toBe(false);

    // Extension in query param
    expect(await page.evaluate(() => isImageFile('https://example.com/download?file=image.jpg'))).toBe(true);
    expect(await page.evaluate(() => isImageFile('https://example.com/api?path=image.png'))).toBe(true);

    // Invalid types
    expect(await page.evaluate(() => isImageFile(null))).toBe(false);
    expect(await page.evaluate(() => isImageFile(undefined))).toBe(false);
    expect(await page.evaluate(() => isImageFile(123))).toBe(false);
    expect(await page.evaluate(() => isImageFile({}))).toBe(false);
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
