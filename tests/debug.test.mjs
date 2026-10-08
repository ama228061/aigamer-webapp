import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../debug.js", import.meta.url), "utf8");
function createDebug() {
  const window = {};
  const output = [];
  runInNewContext(source, {
    window,
    console: { debug: (...args) => output.push(args) },
    structuredClone,
    Date,
  });
  return { debug: window.AGRO_DEBUG, output };
}

test("hidden diagnostics retain only counts, model and timing; unknown usage stays unknown", () => {
  const { debug, output } = createDebug();
  debug.recordRequest({
    status: "ok",
    model: "gemini-3.8-flash",
    durationMs: 125,
    usage: {
      inputTokens: 10,
      outputTokens: 3,
      thinkingTokens: 2,
      totalTokens: 15,
      key: "private-field",
    },
    question: "private-question",
    reply: "private-reply",
  });
  debug.recordRequest({ status: "error", usage: null });
  const summary = debug.summary();
  assert.equal(summary.requests, 2);
  assert.equal(summary.measuredRequests, 1);
  assert.equal(summary.unknownUsageRequests, 1);
  assert.equal(summary.totals.totalTokens, 15);
  const serialized = JSON.stringify(output);
  for (const hidden of ["private-field", "private-question", "private-reply"])
    assert.ok(!serialized.includes(hidden));
  assert.equal(debug.getTokenLog()[1].usage.totalTokens, null);
  const copy = debug.getTokenLog();
  copy[0].usage.totalTokens = 999;
  assert.equal(debug.summary().totals.totalTokens, 15);
  debug.clear();
  assert.equal(debug.summary().requests, 0);
});

test("diagnostics are bounded and reject invalid token counts", () => {
  const { debug } = createDebug();
  for (let i = 0; i < 105; i++)
    debug.recordRequest({
      status: "ok",
      usage: { inputTokens: -1, outputTokens: "a-secret", totalTokens: 1 },
    });
  assert.equal(debug.summary().requests, 100);
  assert.equal(debug.summary().totals.totalTokens, 100);
  assert.equal(debug.getTokenLog()[0].usage.outputTokens, null);
});
