import { handleChat, jsonResponse } from "./chat.mjs";

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path !== "/api/chat") return jsonResponse({ error: "not_found" }, 404);
    if (
      request.method === "POST" &&
      request.headers.get("origin") === env.ALLOWED_ORIGIN
    ) {
      // Cloudflare enforces this across requests, instead of an in-memory counter.
      if (!env.CHAT_RATE_LIMITER)
        return jsonResponse(
          { error: "not_configured" },
          503,
          env.ALLOWED_ORIGIN,
        );
      const key = request.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.CHAT_RATE_LIMITER.limit({ key });
      if (!success)
        return jsonResponse({ error: "rate_limited" }, 429, env.ALLOWED_ORIGIN);
    }
    return handleChat(request, env);
  },
};
