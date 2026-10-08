export const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_BODY = 48000;
const SYSTEM_PROMPT =
  "Вы — АгроПомощник, консультант по сельскому хозяйству и садоводству. Отвечайте по-русски, понятно и по делу. Уточняйте культуру, регион, почву и симптомы, когда от этого зависит совет. Не выдумывайте факты, точные дозировки препаратов или результаты анализов. Предпочитайте бережные методы ухода. Если данных недостаточно, объясните ограничения и предложите обратиться к местному агроному.";

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
    messages.length <= 19 &&
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

// Shared by local development and the Cloudflare Worker. No credentials go to the browser.
export async function handleChat(request, env, fetcher = globalThis.fetch) {
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
          generationConfig: { temperature: 0.65, maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) {
      const error =
        response.status === 404
          ? "model_not_found"
          : [401, 403].includes(response.status)
            ? "provider_auth"
            : response.status === 429
              ? "rate_limited"
              : "upstream_unavailable";
      // Provider bodies can contain sensitive diagnostics; never forward or log them.
      await response.body?.cancel();
      return jsonResponse(
        { error },
        response.status === 429 ? 429 : 502,
        origin,
      );
    }
    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts;
    const reply = Array.isArray(parts)
      ? parts
          .filter((p) => !p.thought && typeof p.text === "string")
          .map((p) => p.text)
          .join("\n")
          .trim()
      : "";
    if (!reply || reply.length > 12000)
      return jsonResponse({ error: "upstream_unavailable" }, 502, origin);
    return jsonResponse({ reply }, 200, origin);
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
