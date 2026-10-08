import test from "node:test";
import assert from "node:assert/strict";
import {
  checkGeminiAccess,
  checkGeminiGeneration,
  checkGeminiInteractions,
} from "../scripts/check-gemini.mjs";
import { DEFAULT_MODEL, providerFailureReason } from "../chat.mjs";

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

test("Interactions diagnostics use Standard tier without storage and report actual tokens", async () => {
  const result = await checkGeminiInteractions(env, async (url, options) => {
    assert.equal(
      url,
      "https://generativelanguage.googleapis.com/v1beta/interactions",
    );
    assert.equal(options.headers["x-goog-api-key"], env.GEMINI_API_KEY);
    const body = JSON.parse(options.body);
    assert.equal(body.service_tier, "standard");
    assert.equal(body.store, false);
    assert.equal(body.generation_config.max_output_tokens, 128);
    return Response.json({
      model: DEFAULT_MODEL,
      steps: [
        {
          type: "thought",
          content: [{ type: "text", text: "private reasoning" }],
        },
        { type: "model_output", content: [{ type: "text", text: "Готово." }] },
      ],
      usage: {
        total_input_tokens: 12,
        total_output_tokens: 3,
        total_tokens: 15,
      },
    });
  });
  assert.equal(result.model, DEFAULT_MODEL);
  assert.equal(result.usage.totalTokens, 15);
  assert.equal(result.usage.thinkingTokens, null);
  assert.equal(result.reply, undefined);
});

test("Interactions diagnosis rejects private error bodies and responses without an answer", async () => {
  await assert.rejects(
    checkGeminiInteractions(env, async () =>
      Response.json(
        {
          error: {
            status: "PERMISSION_DENIED",
            message: env.GEMINI_API_KEY,
          },
        },
        { status: 403 },
      ),
    ),
    (error) => {
      assert.match(error.message, /HTTP 403, PERMISSION_DENIED/);
      assert.ok(!error.message.includes(env.GEMINI_API_KEY));
      return true;
    },
  );
  await assert.rejects(
    checkGeminiInteractions(env, async () =>
      Response.json({ model: DEFAULT_MODEL, steps: [] }),
    ),
  );
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

test("known scope and location errors become fixed codes without copying provider messages", () => {
  for (const [message, reason] of [
    [
      "Request had insufficient authentication scopes.",
      "AUTH_SCOPE_INSUFFICIENT",
    ],
    ["User location is not supported for the API use.", "REGION_UNSUPPORTED"],
    ["API keys are not supported by this API.", "API_KEY_UNSUPPORTED"],
    ["Enable billing to continue.", "BILLING_REQUIRED"],
  ]) {
    assert.equal(
      providerFailureReason({
        error: { message: `${message} ${env.GEMINI_API_KEY}` },
      }),
      reason,
    );
  }
});

test("explicit generation diagnosis uses the shared bounded request and reports actual usage", async () => {
  let calls = 0;
  const result = await checkGeminiGeneration(env, async (url, options) => {
    calls++;
    assert.ok(url.endsWith(`/${DEFAULT_MODEL}:generateContent`));
    assert.equal(options.headers["x-goog-api-key"], env.GEMINI_API_KEY);
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.maxOutputTokens, 768);
    assert.equal(body.contents.length, 1);
    return Response.json({
      modelVersion: DEFAULT_MODEL,
      candidates: [{ content: { parts: [{ text: "Готово." }] } }],
      usageMetadata: {
        promptTokenCount: 50,
        candidatesTokenCount: 3,
        totalTokenCount: 53,
      },
    });
  });
  assert.equal(calls, 1);
  assert.equal(result.model, DEFAULT_MODEL);
  assert.equal(result.usage.totalTokens, 53);
  assert.equal(result.reply, undefined);
});

test("direct generation auth failures omit private messages and project metadata", async () => {
  await assert.rejects(
    checkGeminiGeneration(env, async () =>
      Response.json(
        {
          error: {
            status: "PERMISSION_DENIED",
            message: `Request had insufficient authentication scopes. ${env.GEMINI_API_KEY}`,
            details: [{ metadata: { project: "private-project" } }],
          },
        },
        { status: 403 },
      ),
    ),
    (error) => {
      assert.match(error.message, /AUTH_SCOPE_INSUFFICIENT/);
      assert.match(error.message, /PERMISSION_DENIED/);
      assert.ok(!error.message.includes(env.GEMINI_API_KEY));
      assert.ok(!error.message.includes("private-project"));
      return true;
    },
  );
});
