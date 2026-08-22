import re
import json
import pytest
import subprocess
import time
from playwright.sync_api import Page, expect, Browser

@pytest.fixture(scope="session", autouse=True)
def http_server():
    import os
    import urllib.request
    import urllib.error
    # Start the HTTP server from the parent directory
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    process = subprocess.Popen(["python3", "-m", "http.server", "3000"], cwd=root_dir)

    for _ in range(50):
        try:
            urllib.request.urlopen("http://localhost:3000/bubble_data_manager.html")
            break
        except Exception:
            time.sleep(0.1)

    yield
    process.terminate()
    process.wait()

@pytest.fixture(autouse=True)
def setup_page(page: Page):
    # Mock Bubble API endpoints to prevent hanging during initialization
    def handle_meta(route):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({
                "get": [{"name": "User"}],
                "types": {
                    "User": {
                        "display": "User",
                        "fields": [
                            {"id": "Name", "display": "Name", "type": "text"},
                            {"id": "_id", "display": "Unique ID", "type": "text"},
                            {"id": "Created Date", "display": "Created Date", "type": "date"},
                            {"id": "Modified Date", "display": "Modified Date", "type": "date"}
                        ]
                    }
                }
            })
        )

    def handle_get_options(route):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"response": {}})
        )

    def handle_obj(route):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"response": {"cursor": 0, "count": 0, "remaining": 0, "results": []}})
        )

    page.route("**/api/1.1/meta", handle_meta)
    page.route("**/api/1.1/wf/get-options", handle_get_options)
    page.route("**/api/1.1/obj/**", handle_obj)

    # We add an init script to populate localStorage before the app runs its initialization logic.
    page.add_init_script("""
        window.localStorage.setItem('home', 'https://example-bubble-app.com');
        window.localStorage.setItem('cached_pref', 'fake-api-key');
        window.localStorage.setItem('current_app_index', '1');
    """)

    page.goto('http://localhost:3000/bubble_data_manager.html')


class TestBubbleDataManager:

    def test_page_loads_and_initializes(self, page: Page):
        # Check title
        expect(page).to_have_title(re.compile(r"Bubble Data Manager"))

        # Verify the app selector is visible and has our mocked app
        app_selector = page.locator('#app-selector')
        expect(app_selector).to_be_visible()

        # Verify the data type selector populated with the mocked 'User' type
        data_type_selector = page.locator('#data-type-selector')
        expect(data_type_selector).to_be_attached()
        expect(data_type_selector.locator('option[value="User"]')).to_have_count(1)

    def test_get_app_storage_keys(self, page: Page):
        keys1 = page.evaluate("getAppStorageKeys(1)")
        assert keys1 == {"domain": "home", "apiKey": "cached_pref"}

        keys2 = page.evaluate("getAppStorageKeys(2)")
        assert keys2 == {"domain": "home2", "apiKey": "api2"}

        keys5 = page.evaluate("getAppStorageKeys(5)")
        assert keys5 == {"domain": "home5", "apiKey": "api5"}

    def test_get_all_apps(self, page: Page):
        page.evaluate("""
            window.localStorage.setItem('home2', 'https://another-app.com');
            window.localStorage.setItem('api2', 'another-key');
        """)
        all_apps = page.evaluate("getAllApps()")
        assert len(all_apps) == 2
        assert all_apps[0] == {"index": 1, "domain": "https://example-bubble-app.com", "apiKey": "fake-api-key"}
        assert all_apps[1] == {"index": 2, "domain": "https://another-app.com", "apiKey": "another-key"}

    def test_is_bubble_file(self, page: Page):
        assert page.evaluate("isBubbleFile('//s3.amazonaws.com/app/file.txt')") is True
        assert page.evaluate("isBubbleFile('https://example.s3.amazonaws.com/file.pdf')") is True
        assert page.evaluate("isBubbleFile('https://d1muf25xaso8hp.cdn.bubble.io/f12345/image.png')") is True
        assert page.evaluate("isBubbleFile('https://example.com/image.jpg')") is True
        assert page.evaluate("isBubbleFile('https://example.com/photo.png?size=large')") is True
        assert page.evaluate("isBubbleFile('https://example.com/document.pdf')") is False
        assert page.evaluate("isBubbleFile('https://example.com/')") is False
        assert page.evaluate("isBubbleFile('just a regular string')") is False
        assert page.evaluate("isBubbleFile(null)") is False
        assert page.evaluate("isBubbleFile(undefined)") is False
        assert page.evaluate("isBubbleFile(123)") is False
        assert page.evaluate("isBubbleFile({})") is False

    def test_format_to_datetime_local(self, page: Page):
        assert page.evaluate("formatToDateTimeLocal('')") == ""
        assert page.evaluate("formatToDateTimeLocal(null)") == ""
        assert page.evaluate("formatToDateTimeLocal(undefined)") == ""
        assert page.evaluate("formatToDateTimeLocal('invalid-date')") == ""
        assert page.evaluate("formatToDateTimeLocal('2024-05-05T08:05:00')") == "2024-05-05T08:05"
        assert page.evaluate("formatToDateTimeLocal('2024-11-20T14:30:00')") == "2024-11-20T14:30"
        assert page.evaluate("formatToDateTimeLocal('1999-01-01T00:00:00')") == "1999-01-01T00:00"

    def test_parse_all_settings(self, page: Page):
        assert page.evaluate("""(() => { settingsRecord = null; return parseAllSettings(); })()""") == {}
        assert page.evaluate("""(() => { settingsRecord = {}; return parseAllSettings(); })()""") == {}
        assert page.evaluate("""(() => {
            settingsRecord = { 'bubble_data_manager_settings': '{"columnOrder":["_id","Name"]}' };
            return parseAllSettings();
        })()""") == {"columnOrder": ["_id", "Name"]}
        assert page.evaluate("""(() => {
            settingsRecord = { 'bubble_data_manager_settings': '{"columnOrder":["_id","Name"' };
            return parseAllSettings();
        })()""") == {}
        assert page.evaluate("""(() => {
            settingsRecord = { 'bubble_data_manager_settings': { filterData: "some-data" } };
            return parseAllSettings();
        })()""") == {"filterData": "some-data"}

    def test_escape_html(self, page: Page):
        test_strings = [
            {'input': 'Tom & Jerry', 'expected': 'Tom &amp; Jerry'},
            {'input': '<script>alert(1)</script>', 'expected': '&lt;script&gt;alert(1)&lt;/script&gt;'},
            {'input': 'He said "Hello"', 'expected': 'He said &quot;Hello&quot;'},
            {'input': "It's a beautiful day", 'expected': 'It&#039;s a beautiful day'},
            {'input': '<>&"\'', 'expected': '&lt;&gt;&amp;&quot;&#039;'}
        ]
        for t in test_strings:
            res = page.evaluate("val => escapeHTML(val)", t['input'])
            assert res == t['expected']

        edge_cases = [None, 123, True, {'key': 'value'}, ['array']]
        for val in edge_cases:
            res = page.evaluate("v => escapeHTML(v)", val)
            assert res == val

    def test_get_settings_storage_key(self, page: Page):
        result = page.evaluate("getSettingsStorageKey()")
        assert result == "bubble_data_manager_settings_https://example-bubble-app.com"

    def test_get_settings_entry(self, page: Page):
        assert page.evaluate("""(() => { settingsRecord = null; return getSettingsEntry('testKey'); })()""") == {}
        assert page.evaluate("""(() => {
            settingsRecord = { bubble_data_manager_settings: JSON.stringify({ testKey: { a: 1, b: 2 } }) };
            return getSettingsEntry('testKey');
        })()""") == {"a": 1, "b": 2}
        assert page.evaluate("""(() => {
            settingsRecord = { bubble_data_manager_settings: JSON.stringify({ otherKey: 123 }) };
            return getSettingsEntry('testKey');
        })()""") == {}

    def test_is_boolean_field(self, page: Page):
        assert page.evaluate("""(() => {
            cachedFieldMeta = { 'mock-slug': { '1': { display: 'Is Active', type: 'boolean' } } };
            return isBooleanField('mock-slug', 'Is Active');
        })()""") is True
        assert page.evaluate("""(() => {
            cachedFieldMeta = { 'mock-slug': { '1': { display: 'Count', type: 'number' } } };
            return isBooleanField('mock-slug', 'Count');
        })()""") is False
        assert page.evaluate("""(() => {
            cachedFieldMeta = {}; cachedRecords = [{ 'Is Active': true }]; columnTypeCache = {};
            return isBooleanField('mock-slug', 'Is Active');
        })()""") is True
        assert page.evaluate("""(() => {
            cachedFieldMeta = {}; cachedRecords = [{ 'Is Active': 'yes' }]; columnTypeCache = {};
            return isBooleanField('mock-slug', 'Is Active');
        })()""") is False

    def test_is_number_field(self, page: Page):
        assert page.evaluate("""(() => {
            cachedFieldMeta = { 'mock-slug': { '1': { display: 'Count', type: 'number' } } };
            return isNumberField('mock-slug', 'Count');
        })()""") is True
        assert page.evaluate("""(() => {
            cachedFieldMeta = {}; cachedRecords = [{ 'Count': 42 }]; columnTypeCache = {};
            return isNumberField('mock-slug', 'Count');
        })()""") is True

    def test_is_date_field(self, page: Page):
        assert page.evaluate("""(() => {
            cachedFieldMeta = { 'mock-slug': { '1': { display: 'Created', type: 'date' } } };
            return isDateField('mock-slug', 'Created');
        })()""") is True
        assert page.evaluate("""(() => {
            cachedFieldMeta = {}; cachedRecords = [{ 'Created': '2024-05-05T08:05:00.000Z' }];
            return isDateField('mock-slug', 'Created');
        })()""") is True

    def test_extract_img_urls_from_json(self, page: Page):
        assert page.evaluate("extractImgUrlsFromJson(null)") == []
        assert page.evaluate("extractImgUrlsFromJson({})") == []
        assert page.evaluate("extractImgUrlsFromJson('https://example.com/image.jpg')") == ['https://example.com/image.jpg']
        assert page.evaluate("extractImgUrlsFromJson('just a regular string')") == []

        nested_obj = page.evaluate("""(() => {
            const data = {
                name: 'test',
                profile: { avatar: 'https://example.com/avatar.png', details: { banner: '//s3.amazonaws.com/bucket/banner.jpg' } },
                document: 'https://example.com/doc.pdf'
            };
            return extractImgUrlsFromJson(data);
        })()""")
        assert nested_obj == ['https://example.com/avatar.png', '//s3.amazonaws.com/bucket/banner.jpg']

        array_res = page.evaluate("""(() => {
            const data = [ 'https://example.com/image1.jpg', 'https://d1muf25xaso8hp.cdn.bubble.io/img.webp', 'not a image' ];
            return extractImgUrlsFromJson(data);
        })()""")
        assert array_res == ['https://example.com/image1.jpg', 'https://d1muf25xaso8hp.cdn.bubble.io/img.webp']

        complex_res = page.evaluate("""(() => {
            const data = {
                items: [ { img: 'https://example.com/a.jpg' }, { data: { url: 'https://example.s3.amazonaws.com/b.png' } } ],
                extra: 'https://test.com/c.gif'
            };
            return extractImgUrlsFromJson(data);
        })()""")
        assert sorted(complex_res) == sorted(['https://example.com/a.jpg', 'https://example.s3.amazonaws.com/b.png', 'https://test.com/c.gif'])

    def test_is_image_file(self, page: Page):
        assert page.evaluate("isImageFile('image.jpg')") is True
        assert page.evaluate("isImageFile('path/to/image.png')") is True
        assert page.evaluate("isImageFile('https://example.com/img.webp')") is True
        assert page.evaluate("isImageFile('IMAGE.JPG')") is True
        assert page.evaluate("isImageFile('image.gif?v=123')") is True
        assert page.evaluate("isImageFile('image.jpg#top')") is True
        assert page.evaluate("isImageFile('document.pdf')") is False
        assert page.evaluate("isImageFile('archive.zip')") is False
        assert page.evaluate("isImageFile('https://example.com/download?file=image.jpg')") is True
        assert page.evaluate("isImageFile(null)") is False
        assert page.evaluate("isImageFile(undefined)") is False


    def test_option_slug_matches_display_name(self, page: Page):
        # 1. Exact dictionary match
        assert page.evaluate("(() => { optionSlugToDisplayName = { 'custom_slug_1': 'Custom Display Name' }; return optionSlugMatchesDisplayName('custom_slug_1', 'Custom Display Name'); })()") is True
        assert page.evaluate("(() => { optionSlugToDisplayName = { 'another_slug': 'Another Name' }; return optionSlugMatchesDisplayName('another_slug', 'Another Name'); })()") is True

        # 2. Case-insensitive exact match
        assert page.evaluate("(() => { optionSlugToDisplayName = {}; return optionSlugMatchesDisplayName('ACTIVE', 'active'); })()") is True
        assert page.evaluate("optionSlugMatchesDisplayName('pending', 'Pending')") is True
        assert page.evaluate("optionSlugMatchesDisplayName('CamelCase', 'camelcase')") is True

        # 3. Underscore replacement match
        assert page.evaluate("optionSlugMatchesDisplayName('in_progress', 'In Progress')") is True
        assert page.evaluate("optionSlugMatchesDisplayName('REQUIRES_ACTION', 'requires action')") is True
        assert page.evaluate("optionSlugMatchesDisplayName('multiple_words_here', 'Multiple Words Here')") is True

        # 4. Failure cases
        assert page.evaluate("optionSlugMatchesDisplayName('custom_slug_1', 'Wrong Name')") is False
        assert page.evaluate("optionSlugMatchesDisplayName('active', 'inactive')") is False
        assert page.evaluate("optionSlugMatchesDisplayName('in_progress', 'in-progress')") is False

        # 5. Edge cases (null / undefined inputs)
        assert page.evaluate("optionSlugMatchesDisplayName(null, 'active')") is False
        assert page.evaluate("optionSlugMatchesDisplayName('active', null)") is False
        assert page.evaluate("optionSlugMatchesDisplayName(undefined, undefined)") is False
        assert page.evaluate("optionSlugMatchesDisplayName(123, 123)") is False

class TestTimezoneUtilityFunctions:


    @pytest.mark.parametrize("browser_context_args", [{"timezone_id": "UTC"}])
    def test_utc_timezone(self, page: Page):
        label = page.evaluate("getLocalTimeZoneLabel()")
        assert label == 'Local Time: UTC (UTC+00:00)'

    @pytest.mark.parametrize("browser_context_args", [{"timezone_id": "Asia/Tokyo"}])
    def test_positive_offset_timezone(self, page: Page):
        label = page.evaluate("getLocalTimeZoneLabel()")
        assert label == 'Local Time: Asia/Tokyo (UTC+09:00)'

    @pytest.mark.parametrize("browser_context_args", [{"timezone_id": "Pacific/Honolulu"}])
    def test_negative_offset_timezone(self, page: Page):
        label = page.evaluate("getLocalTimeZoneLabel()")
        assert label == 'Local Time: Pacific/Honolulu (UTC-10:00)'

    @pytest.mark.parametrize("browser_context_args", [{"timezone_id": "Asia/Kolkata"}])
    def test_fractional_offset_timezone(self, page: Page):
        label = page.evaluate("getLocalTimeZoneLabel()")
        assert bool(re.search(r"Local Time: Asia/(Kolkata|Calcutta) \(UTC\+05:30\)", label)) is True

    def test_fallback_behavior_when_intl_unavailable(self, page: Page):
        label = page.evaluate("""(() => {
            const originalIntl = window.Intl;
            window.Intl = { DateTimeFormat: () => { throw new Error('Intl not supported'); } };
            const result = getLocalTimeZoneLabel();
            window.Intl = originalIntl;
            return result;
        })()""")

        assert label == 'Local Browser Timezone'
