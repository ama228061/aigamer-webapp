// Per-tab diagnostics only. Nothing is rendered or stored on disk.
(() => {
  const records = [];
  const fields = [
    "inputTokens",
    "outputTokens",
    "thinkingTokens",
    "cachedInputTokens",
    "totalTokens",
  ];
  const count = (value) =>
    Number.isSafeInteger(value) && value >= 0 ? value : null;
  window.AGRO_DEBUG = Object.freeze({
    recordRequest({ status, model, usage, durationMs }) {
      const record = {
        time: new Date().toISOString(),
        status: status === "ok" ? "ok" : "error",
        model:
          typeof model === "string" && /^gemini-[\w.-]+$/.test(model)
            ? model
            : null,
        durationMs: count(durationMs),
        usage: Object.fromEntries(
          fields.map((field) => [field, count(usage?.[field])]),
        ),
      };
      records.push(record);
      if (records.length > 100) records.shift();
      console.debug("AGRO token usage", structuredClone(record));
    },
    getTokenLog() {
      return structuredClone(records);
    },
    summary() {
      return {
        requests: records.length,
        measuredRequests: records.filter((r) => r.usage.totalTokens !== null)
          .length,
        unknownUsageRequests: records.filter(
          (r) => r.usage.totalTokens === null,
        ).length,
        totals: Object.fromEntries(
          fields.map((field) => [
            field,
            records.reduce((sum, r) => sum + (r.usage[field] ?? 0), 0),
          ]),
        ),
      };
    },
    clear() {
      records.length = 0;
    },
  });
})();
