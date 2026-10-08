import test from "node:test";
import assert from "node:assert/strict";
import { checkGeminiAccess } from "../scripts/check-gemini.mjs";
import { DEFAULT_MODEL } from "../chat.mjs";

const env = { GEMINI_API_KEY: "test-only-private-key" };

test("Gemini access check uses a read-only model request with the key in its header", async () => {
  const model = await checkGeminiAccess(env, async (url, options) => {
    assert.equal(
      url,
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}`,
    );
    assert.equal(new URL(url).search, "");
    assert.equal(options.method, "GET");
    assert.equal(options.body, undefined);
    assert.equal(options.headers["x-goog-api-key"], env.GEMINI_API_KEY);
    return Response.json({
      name: `models/${DEFAULT_MODEL}`,
      supportedGenerationMethods: ["generateContent", "countTokens"],
    });
  });
  assert.equal(model, DEFAULT_MODEL);
});

test("Gemini authentication diagnosis contains fixed codes without private provider details", async () => {
  for (const [error, expected] of [
    [
      { message: `Your API key was reported as leaked. ${env.GEMINI_API_KEY}` },
      "API_KEY_REPORTED_LEAKED",
    ],
    [
      {
        message: `Private diagnostic ${env.GEMINI_API_KEY}`,
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            reason: "API_KEY_HTTP_REFERRER_BLOCKED",
            metadata: { privateProject: "private-project-id" },
          },
        ],
      },
      "API_KEY_HTTP_REFERRER_BLOCKED",
    ],
    [
      {
        message: env.GEMINI_API_KEY,
        details: [{ reason: env.GEMINI_API_KEY }],
      },
      null,
    ],
  ]) {
    await assert.rejects(
      checkGeminiAccess(env, async () =>
        Response.json({ error }, { status: 403 }),
      ),
      (failure) => {
        assert.match(failure.message, /HTTP 403/);
        if (expected) assert.ok(failure.message.includes(expected));
        assert.ok(!failure.message.includes(env.GEMINI_API_KEY));
        assert.ok(!failure.message.includes("private-project-id"));
        return true;
      },
    );
  }
});

test("unavailable or incompatible model metadata cannot pass the access check", async () => {
  for (const response of [
    () => Response.json({}, { status: 404 }),
    () =>
      Response.json({
        name: `models/${DEFAULT_MODEL}`,
        supportedGenerationMethods: ["countTokens"],
      }),
  ]) {
    await assert.rejects(checkGeminiAccess(env, async () => response()));
  }
});
