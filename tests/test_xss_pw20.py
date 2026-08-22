from playwright.sync_api import sync_playwright
def test_xss():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        alerts = []
        page.on('dialog', lambda dialog: (alerts.append(dialog.message), dialog.accept()))
        page.goto('http://localhost:3002/test_xss_25.html')
        page.click('text=JSON')
        print("Alerts:", alerts)
        browser.close()
if __name__ == "__main__":
    test_xss()
