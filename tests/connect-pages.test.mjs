import test from "node:test";
import assert from "node:assert/strict";
import { connectPages } from "../scripts/connect-pages.mjs";

const readyPreflight = () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "https://ama228061.github.io",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });

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
        if (options.method === "OPTIONS") return readyPreflight();
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
    [
      502,
      { error: "provider_auth", providerReason: "API_KEY_REPORTED_LEAKED" },
    ],
    [200, { reply: " " }],
    [200, { reply: "Готово.", model: "gemini-2.5-flash" }],
  ]) {
    await assert.rejects(
      connectPages("https://agro-assistant.example.workers.dev", {
        fetcher: async (url, options) =>
          options.method === "OPTIONS"
            ? readyPreflight()
            : Response.json(body, { status }),
        save: async () => assert.fail("Failed deployment was published"),
      }),
      /Public configuration was not changed/,
    );
  }
});

test("connection failures do not copy arbitrary provider diagnostics to deployment logs", async () => {
  await assert.rejects(
    connectPages("https://agro-assistant.example.workers.dev", {
      fetcher: async (url, options) =>
        options.method === "OPTIONS"
          ? readyPreflight()
          : Response.json(
              {
                error: "provider_auth",
                providerReason: "private-key-and-project-details",
              },
              { status: 502 },
            ),
      save: async () => assert.fail("Rejected key was published"),
    }),
    (failure) => {
      assert.match(failure.message, /provider_auth/);
      assert.ok(!failure.message.includes("private-key-and-project-details"));
      return true;
    },
  );
});

test("routing readiness probes wait for propagation without repeating Gemini generation", async () => {
  let probes = 0;
  let generations = 0;
  await connectPages("https://agro-assistant.example.workers.dev", {
    fetcher: async (url, options) => {
      if (options.method === "OPTIONS") {
        probes++;
        return probes < 3
          ? new Response("Not found", { status: 404 })
          : readyPreflight();
      }
      generations++;
      return Response.json({ reply: "Готово.", model: "gemini-3.8-flash" });
    },
    pause: async () => {},
    save: async () => {},
  });
  assert.equal(probes, 3);
  assert.equal(generations, 1);
});

test("unavailable routes and incorrect browser origins cannot trigger generation or publication", async () => {
  for (const response of [
    () => new Response("Not found", { status: 404 }),
    () =>
      new Response(null, {
        status: 204,
        headers: { "Access-Control-Allow-Origin": "https://example.org" },
      }),
  ]) {
    await assert.rejects(
      connectPages("https://agro-assistant.example.workers.dev", {
        fetcher: async (url, options) => {
          assert.equal(options.method, "OPTIONS");
          return response();
        },
        readinessAttempts: 2,
        pause: async () => {},
        save: async () => assert.fail("Unverified endpoint was published"),
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
