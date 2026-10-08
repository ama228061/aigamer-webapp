import test from "node:test";
import assert from "node:assert/strict";
import { deploymentResult } from "../scripts/deploy-worker.mjs";

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

test("deployment failure reports Cloudflare codes without forwarding credential-bearing diagnostics", () => {
  const result = {
    status: 1,
    stderr:
      "Authentication error [code: 9109]\nProvider diagnostic: sample-private-token-value",
  };
  assert.throws(
    () => deploymentResult(result),
    (error) => {
      assert.match(error.message, /9109/);
      assert.match(error.message, /authentication or permissions/);
      assert.ok(!error.message.includes("sample-private-token-value"));
      assert.ok(!error.message.includes("Provider diagnostic"));
      return true;
    },
  );
});
