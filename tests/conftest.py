import subprocess
import sys

def pytest_sessionstart(session):
    print("\nChecking for Playwright Chromium browser...")
    subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
