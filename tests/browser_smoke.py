"""Run against `PORT=8001 npm start`; live provider calls are never faked as verified."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

base = os.environ.get("SMOKE_BASE_URL", "http://127.0.0.1:8001/aigamer-webapp/")
out = Path(os.environ.get("SMOKE_OUTPUT_DIR", "/tmp/agro-browser-results"))
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 1440, "height": 1024})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base, wait_until="networkidle")
    expect(page.locator("h1")).to_contain_text("С заботой о земле")
    expect(page.locator(".crop-card")).to_have_count(6)
    for image in page.locator(".crop-card img").all():
        image.scroll_into_view_if_needed()
        expect(image).to_be_visible()
        page.wait_for_function("img => img.complete && img.naturalWidth > 0", arg=image.element_handle())
    page.locator(".hero").scroll_into_view_if_needed()
    page.screenshot(path=str(out / "desktop.png"), full_page=True)
    page.locator('[data-filter="fruit"]').click()
    expect(page.locator(".crop-card")).to_have_count(2)
    page.get_by_role("button", name="Открыть карточку: Яблоня", exact=True).click()
    expect(page.locator("#crop-title")).to_have_text("Яблоня")
    page.locator("#crop-chat").click()
    expect(page.locator("#chat-input")).to_have_value("Расскажите подробнее о посадке и уходе: Яблоня.")
    page.keyboard.press("Escape")
    expect(page.locator("#chat")).not_to_be_visible()

    # Actual local API without a key: verify a useful error, not a fabricated answer.
    page.locator(".chat-launcher").click()
    page.locator("#chat-input").fill("Как поливать яблоню?")
    page.locator("#send-chat").click()
    expect(page.locator("#chat-error")).to_be_visible()
    expect(page.locator("#chat-error")).to_contain_text("пока не подключён")
    print("Live local API: missing-key state displayed correctly (Gemini generation unverified).")

    page.reload(wait_until="networkidle")
    requests = []
    reply = "Проверьте влажность почвы. <img src=x onerror=alert(1)>"
    def mock_api(route):
        requests.append(route.request.post_data_json)
        if len(requests) == 1:
            route.fulfill(status=429, content_type="application/json", body=json.dumps({"error": "rate_limited"}))
        else:
            route.fulfill(content_type="application/json", body=json.dumps({"reply": reply}))
    page.route("**/api/chat", mock_api)
    page.locator(".chat-launcher").click()
    page.locator("#chat-input").fill("Когда сеять?")
    page.locator("#chat-input").press("Enter")
    expect(page.locator("#chat-error")).to_contain_text("много запросов")
    page.locator("#retry-chat").click()
    expect(page.locator("#chat-error")).not_to_be_visible()
    expect(page.locator(".assistant-message").last).to_contain_text(reply)
    expect(page.locator(".assistant-message img")).to_have_count(0)
    expect(page.locator(".user-message")).to_have_count(1)
    assert requests[0] == requests[1], "Retry duplicated the user turn"
    page.locator("#chat-input").fill("А после дождя?")
    page.locator("#chat-input").press("Enter")
    expect(page.locator(".assistant-message")).to_have_count(3)
    assert [m["role"] for m in requests[-1]["messages"]] == ["user", "model", "user"]
    page.screenshot(path=str(out / "chat.png"))
    print("Mocked browser chat: retry, history, Enter submission and safe text rendering passed.")

    for width, height in [(768, 1024), (390, 844), (320, 640)]:
        page.keyboard.press("Escape")
        page.set_viewport_size({"width": width, "height": height})
        page.goto(base, wait_until="networkidle")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Overflow at {width}px"
        page.locator(".menu-toggle").click()
        expect(page.locator(".menu-toggle")).to_have_attribute("aria-expanded", "true")
        page.locator('.nav a[href="#gallery"]').click()
        expect(page.locator(".menu-toggle")).to_have_attribute("aria-expanded", "false")
        page.locator(".hero").scroll_into_view_if_needed()
        page.screenshot(path=str(out / f"mobile-{width}.png"))
        page.locator(".chat-launcher").click()
        bounds = page.locator("#chat").bounding_box()
        assert bounds["x"] >= 0 and bounds["y"] >= 0
        assert bounds["x"] + bounds["width"] <= width and bounds["y"] + bounds["height"] <= height
        page.screenshot(path=str(out / f"mobile-chat-{width}.png"))
    assert not errors, errors
    browser.close()
    print("Desktop/tablet/mobile navigation, gallery, images and dialog sizing passed; no JS errors.")
