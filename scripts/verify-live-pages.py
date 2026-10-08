"""Verify one real chat turn and the private token journal on published Pages."""

import json
import os
import re
import shutil
import sys
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


def verify():
    worker = urlparse(os.environ.get("WORKER_URL", ""))
    if (
        worker.scheme != "https"
        or not worker.hostname
        or not worker.hostname.endswith(".workers.dev")
        or worker.username
        or worker.password
        or worker.port
        or worker.query
        or worker.fragment
    ):
        raise RuntimeError("Expected the deployed HTTPS workers.dev address.")
    expected_endpoint = f"https://{worker.hostname}/api/chat"
    executable = next(
        (
            found
            for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")
            if (found := shutil.which(name))
        ),
        None,
    )
    if not executable:
        raise RuntimeError("A system Chrome or Chromium browser is required.")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=executable, headless=True, args=["--no-sandbox"]
        )
        try:
            page = browser.new_page(viewport={"width": 390, "height": 844})
            page.goto(
                "https://ama228061.github.io/aigamer-webapp/",
                wait_until="domcontentloaded",
                timeout=30000,
            )
            page.wait_for_function("window.AGRO_CONFIG && window.AGRO_DEBUG")
            if page.evaluate("AGRO_CONFIG.chatEndpoint") != expected_endpoint:
                raise RuntimeError("Published browser configuration does not match the Worker.")
            page.locator(".chat-launcher").click()
            page.locator("#chat-input").fill("Ответьте одним словом: готово.")
            page.locator("#send-chat").click()
            # Wait for the actual frontend request and its finally-block journal.
            page.wait_for_function("AGRO_DEBUG.getTokenLog().length === 1", timeout=45000)
            record = page.evaluate("AGRO_DEBUG.getTokenLog()[0]")
            if record.get("status") != "ok":
                raise RuntimeError("The published browser chat did not receive a successful answer.")
            if not re.fullmatch(r"gemini-3\.1-flash-lite[\w.-]*", record.get("model") or ""):
                raise RuntimeError("The browser did not confirm Gemini 3.1 Flash-Lite.")
            if page.locator(".assistant-message").count() != 2:
                raise RuntimeError("The frontend did not render the actual assistant answer.")
            if page.locator("#chat-error").is_visible():
                raise RuntimeError("The browser still displays a chat error.")

            # This allowlist contains counts only: no answer, prompt or API key.
            fields = ("inputTokens", "outputTokens", "thinkingTokens", "cachedInputTokens", "totalTokens")
            usage = {
                field: value if type(value) is int and value >= 0 else None
                for field in fields
                for value in [record.get("usage", {}).get(field)]
            }
            result = {"event": "live_browser_token_usage", "model": record["model"], "usage": usage}
            print("::notice::" + json.dumps(result, ensure_ascii=True))
            print("::notice::Published mobile browser chat returned a real answer and recorded its token usage.")
        finally:
            browser.close()


if __name__ == "__main__":
    try:
        verify()
    except Exception as error:
        # Only our fixed diagnostics are public; browser failures can contain URLs.
        message = str(error) if isinstance(error, RuntimeError) else "Browser verification failed; inspect its environment and deployment readiness."
        print("::error::" + message, file=sys.stderr)
        sys.exit(1)
