import test from "node:test";
import assert from "node:assert/strict";
import {
  deploymentResult,
  deployUsingREST,
} from "../scripts/deploy-worker.mjs";

test("Worker deployment extracts its actual public URL from Wrangler output", () => {
  assert.equal(
    deploymentResult({
      status: 0,
      stdout:
        "Uploaded agro-assistant (2.00 sec)\n  https://agro-assistant.example.workers.dev\nCurrent Version ID: example",
    }),
    "https://agro-assistant.example.workers.dev",
  );
  assert.throws(
    () => deploymentResult({ status: 0, stdout: "Nothing deployed" }),
    /did not return/,
  );
});

const config = {
  name: "agro-assistant",
  compatibility_date: "2026-10-07",
  vars: {
    ALLOWED_ORIGIN: "https://ama228061.github.io",
    GEMINI_MODEL: "gemini-3.8-flash",
  },
  ratelimits: [
    {
      name: "CHAT_RATE_LIMITER",
      namespace_id: "1001",
      simple: { limit: 5, period: 60 },
    },
  ],
  observability: { enabled: true },
};
const env = {
  CLOUDFLARE_ACCOUNT_ID: "example-account",
  CLOUDFLARE_API_TOKEN: "sample-private-token",
};

test("REST deployment preserves rate limits and modules, and derives its URL from Cloudflare", async () => {
  const calls = [];
  const url = await deployUsingREST(config, env, async (url, options) => {
    calls.push({ url, options });
    return Response.json({
      success: true,
      result: url.endsWith("/workers/subdomain")
        ? { subdomain: "confirmed-account" }
        : {},
    });
  });
  assert.equal(url, "https://agro-assistant.confirmed-account.workers.dev");
  assert.equal(calls.length, 3);
  assert.equal(
    calls[0].options.headers.Authorization,
    "Bearer sample-private-token",
  );
  const metadata = JSON.parse(calls[0].options.body.get("metadata"));
  assert.equal(metadata.main_module, "worker.mjs");
  assert.ok(
    metadata.bindings.some(
      (binding) =>
        binding.type === "ratelimit" && binding.name === "CHAT_RATE_LIMITER",
    ),
  );
  assert.ok(!JSON.stringify(metadata).includes(env.CLOUDFLARE_API_TOKEN));
  assert.ok(
    (await calls[0].options.body.get("worker.mjs").text()).includes(
      "./chat.mjs",
    ),
  );
  assert.ok(calls[0].options.body.get("chat.mjs"));
  assert.equal(calls[2].options.method, "POST");
});

test("REST deployment reports permission failures without disclosing provider bodies or credentials", async () => {
  await assert.rejects(
    () =>
      deployUsingREST(config, env, async () =>
        Response.json(
          {
            success: false,
            errors: [{ code: 9109, message: "sample-private-token" }],
          },
          { status: 403 },
        ),
      ),
    (error) => {
      assert.match(error.message, /HTTP 403/);
      assert.match(error.message, /9109/);
      assert.ok(!error.message.includes(env.CLOUDFLARE_API_TOKEN));
      return true;
    },
  );
});

test("deployment failure reports Cloudflare error details with credentials redacted", () => {
  const result = {
    status: 1,
    stderr:
      "[ERROR] A request to the Cloudflare API failed.\n\nNo access to the specified resource. [code: 9109]\nToken: sample-private-token-value",
  };
  assert.throws(
    () => deploymentResult(result, ["sample-private-token-value"]),
    (error) => {
      assert.match(error.message, /9109/);
      assert.match(error.message, /authentication or permissions/);
      assert.ok(!error.message.includes("sample-private-token-value"));
      assert.match(error.message, /\[redacted\]/);
      return true;
    },
  );
  assert.throws(
    () =>
      deploymentResult(
        {
          status: 1,
          stderr: "[ERROR] Invalid token sample-private-token-value",
        },
        ["sample-private-token-value"],
      ),
    (error) => {
      assert.ok(!error.message.includes("sample-private-token-value"));
      assert.match(error.message, /\[redacted\]/);
      return true;
    },
  );
});
