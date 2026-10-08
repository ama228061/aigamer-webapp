export const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const SAFE_PROVIDER_REASONS = new Set([
  "API_KEY_INVALID",
  "API_KEY_EXPIRED",
  "API_KEY_NOT_FOUND",
  "API_KEY_MISSING",
  "API_KEY_BLOCKED",
  "API_KEY_LEAKED",
  "API_KEY_REPORTED_LEAKED",
  "API_KEY_HTTP_REFERRER_BLOCKED",
  "API_KEY_IP_ADDRESS_BLOCKED",
  "API_KEY_SERVICE_BLOCKED",
  "API_KEY_ANDROID_APP_BLOCKED",
  "API_KEY_IOS_APP_BLOCKED",
  "SERVICE_DISABLED",
  "CONSUMER_INVALID",
  "BILLING_DISABLED",
  "CREDENTIALS_MISSING",
  "IAM_PERMISSION_DENIED",
  "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
  "ACCESS_TOKEN_TYPE_UNSUPPORTED",
  "API_KEY_RESTRICTION_VIOLATION",
  "SECURITY_POLICY_VIOLATED",
  "AUTH_SCOPE_INSUFFICIENT",
  "REGION_UNSUPPORTED",
  "BILLING_REQUIRED",
  "API_KEY_UNSUPPORTED",
]);

export function safeProviderStatus(status) {
  return [
    "PERMISSION_DENIED",
    "UNAUTHENTICATED",
    "FAILED_PRECONDITION",
    "RESOURCE_EXHAUSTED",
    "NOT_FOUND",
    "INVALID_ARGUMENT",
    "UNAVAILABLE",
    "INTERNAL",
  ].includes(status)
    ? status
    : null;
}

export function safeProviderReason(reason) {
  return SAFE_PROVIDER_REASONS.has(reason) ? reason : null;
}

// Emit only fixed diagnostic codes, never provider messages or project metadata.
export function providerFailureReason(data) {
  if (
    typeof data?.error?.message === "string" &&
    /reported as leaked/i.test(data.error.message)
  )
    return "API_KEY_REPORTED_LEAKED";
  const details = data?.error?.details;
  for (const detail of Array.isArray(details) ? details : []) {
    if (
      detail?.["@type"] === "type.googleapis.com/google.rpc.ErrorInfo" &&
      safeProviderReason(detail.reason)
    )
      return detail.reason;
  }
  const message =
    typeof data?.error?.message === "string" ? data.error.message : "";
  for (const [pattern, reason] of [
    [/insufficient authentication scopes/i, "AUTH_SCOPE_INSUFFICIENT"],
    [
      /user location is not supported|not (?:available|supported) in your (?:country|region)/i,
      "REGION_UNSUPPORTED",
    ],
    [
      /enable billing|billing is disabled|billing.*required/i,
      "BILLING_REQUIRED",
    ],
    [/API keys? (?:are|is) not supported/i, "API_KEY_UNSUPPORTED"],
    [/API key.*(?:not valid|invalid)/i, "API_KEY_INVALID"],
  ]) {
    if (pattern.test(message)) return reason;
  }
  return null;
}

const MAX_BODY = 16000;
const SYSTEM_PROMPT =
  "Вы — АгроПомощник, консультант по сельскому хозяйству и садоводству. Отвечайте по-русски, кратко: обычно 2–5 предложений. Уточняйте культуру, регион, почву и симптомы, когда от этого зависит совет. Не выдумывайте факты, точные дозировки препаратов или результаты анализов. Предпочитайте бережные методы ухода. Если данных недостаточно, объясните ограничения и предложите обратиться к местному агроному.";

export function jsonResponse(data, status = 200, origin = "") {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(data), { status, headers });
}

async function readJSON(request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY)
    throw new Error("too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_request");
  let size = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      throw new Error("too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function validMessages(messages) {
  return (
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.length <= 5 &&
    messages.length % 2 === 1 &&
    messages.every((m, i) => {
      const role = i % 2 === 0 ? "user" : "model";
      return (
        m &&
        m.role === role &&
        typeof m.text === "string" &&
        m.text.trim().length > 0 &&
        m.text.length <= (role === "user" ? 2000 : 12000)
      );
    })
  );
}

export function reportedUsage(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const mapping = {
    inputTokens: "promptTokenCount",
    outputTokens: "candidatesTokenCount",
    thinkingTokens: "thoughtsTokenCount",
    cachedInputTokens: "cachedContentTokenCount",
    totalTokens: "totalTokenCount",
  };
  const usage = Object.fromEntries(
    Object.entries(mapping).map(([field, key]) => [
      field,
      Number.isSafeInteger(metadata[key]) && metadata[key] >= 0
        ? metadata[key]
        : null,
    ]),
  );
  return Object.values(usage).some((value) => value !== null) ? usage : null;
}

// Shared by local development and the Cloudflare Worker. No credentials go to the browser.
export async function handleChat(
  request,
  env,
  fetcher = globalThis.fetch,
  logUsage = (record) => console.info(JSON.stringify(record)),
) {
  const origin = request.headers.get("origin") || "";
  if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN)
    return jsonResponse({ error: "forbidden" }, 403);
  if (request.method === "OPTIONS") {
    if (request.headers.get("access-control-request-method") !== "POST")
      return jsonResponse({ error: "method_not_allowed" }, 405, origin);
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    });
  }
  if (request.method !== "POST")
    return jsonResponse({ error: "method_not_allowed" }, 405, origin);
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    return jsonResponse({ error: "invalid_request" }, 415, origin);
  let messages;
  try {
    ({ messages } = await readJSON(request));
    if (!validMessages(messages)) throw new Error("invalid_request");
  } catch (error) {
    return jsonResponse(
      { error: "invalid_request" },
      error.message === "too_large" ? 413 : 400,
      origin,
    );
  }
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  if (!env.GEMINI_API_KEY || !/^gemini-[a-zA-Z0-9.-]+$/.test(model))
    return jsonResponse({ error: "not_configured" }, 503, origin);
  try {
    const response = await fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: messages.map((m) => ({
            role: m.role,
            parts: [{ text: m.text }],
          })),
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          // Gemini 3 uses its recommended default temperature (1.0).
          generationConfig: {
            maxOutputTokens: 768,
            thinkingConfig: {
              thinkingLevel: model.includes("flash") ? "minimal" : "low",
            },
          },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) {
      const providerData = await response.json().catch(() => ({}));
      const providerReason = providerFailureReason(providerData);
      const providerStatus = safeProviderStatus(providerData.error?.status);
      const error =
        response.status === 404
          ? "model_not_found"
          : [401, 403].includes(response.status)
            ? "provider_auth"
            : response.status === 429
              ? "rate_limited"
              : "upstream_unavailable";
      // Provider bodies can contain sensitive diagnostics; return only fixed codes.
      return jsonResponse(
        {
          error,
          ...(providerReason ? { providerReason } : {}),
          ...(providerStatus ? { providerStatus } : {}),
        },
        response.status === 429 ? 429 : 502,
        origin,
      );
    }
    const data = await response.json();
    const usage = reportedUsage(data.usageMetadata);
    const usedModel =
      typeof data.modelVersion === "string" &&
      /^gemini-[\w.-]+$/.test(data.modelVersion)
        ? data.modelVersion
        : model;
    if (usage)
      logUsage({
        event: "gemini_token_usage",
        time: new Date().toISOString(),
        model: usedModel,
        usage,
      });
    const parts = data.candidates?.[0]?.content?.parts;
    const reply = Array.isArray(parts)
      ? parts
          .filter((p) => !p.thought && typeof p.text === "string")
          .map((p) => p.text)
          .join("\n")
          .trim()
      : "";
    if (!reply || reply.length > 12000)
      return jsonResponse(
        { error: "upstream_unavailable", model: usedModel, usage },
        502,
        origin,
      );
    return jsonResponse({ reply, model: usedModel, usage }, 200, origin);
  } catch (error) {
    return jsonResponse(
      {
        error: ["TimeoutError", "AbortError"].includes(error.name)
          ? "timeout"
          : "upstream_unavailable",
      },
      error.name === "TimeoutError" || error.name === "AbortError" ? 504 : 502,
      origin,
    );
  }
}
