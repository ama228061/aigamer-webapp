import test from "node:test";
import assert from "node:assert/strict";
import { connectPages } from "../scripts/connect-pages.mjs";

test("public endpoint is saved only after the deployed Worker returns a real answer", async () => {
  let saved;
  const endpoint = await connectPages(
    "https://agro-assistant.example.workers.dev",
    {
      fetcher: async (url, options) => {
        assert.equal(
          url,
          "https://agro-assistant.example.workers.dev/api/chat",
        );
        assert.equal(options.headers.Origin, "https://ama228061.github.io");
        assert.equal(options.headers["x-goog-api-key"], undefined);
        assert.deepEqual(JSON.parse(options.body).messages, [
          { role: "user", text: "Ответьте одним словом: готово." },
        ]);
        return Response.json({ reply: "Готово.", model: "gemini-3.8-flash" });
      },
      save: async (content) => {
        saved = content;
      },
    },
  );
  assert.equal(endpoint, "https://agro-assistant.example.workers.dev/api/chat");
  assert.match(saved, /chatEndpoint/);
  assert.ok(saved.includes(endpoint));
});

test("a missing key, unavailable model or malformed reply leaves public configuration unchanged", async () => {
  for (const [status, body] of [
    [503, { error: "not_configured" }],
    [502, { error: "model_not_found" }],
    [200, { reply: " " }],
    [200, { reply: "Готово.", model: "gemini-2.5-flash" }],
  ]) {
    await assert.rejects(
      connectPages("https://agro-assistant.example.workers.dev", {
        fetcher: async () => Response.json(body, { status }),
        save: async () => assert.fail("Failed deployment was published"),
      }),
      /Public configuration was not changed/,
    );
  }
});

test("an unexpected deployment URL never receives a verification request", async () => {
  for (const url of [
    "http://test.workers.dev",
    "https://evil.example",
    "https://user:password@test.workers.dev",
    "https://test.workers.dev?secret=example",
  ]) {
    await assert.rejects(
      connectPages(url, {
        fetcher: async () => assert.fail("Unexpected URL received a request"),
        save: async () => assert.fail("Unexpected URL was saved"),
      }),
      /Expected the HTTPS workers.dev URL/,
    );
  }
});
