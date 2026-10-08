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

test("deployment failure reports Cloudflare error details with credentials redacted", () => {
  const result = {
    status: 1,
    stderr:
      "[ERROR] A request to the Cloudflare API failed.\n\nAuthentication error [code: 9109]\nToken: sample-private-token-value",
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
