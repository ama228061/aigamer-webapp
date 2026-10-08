import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SITE_ORIGIN = "https://ama228061.github.io";

// Run after Wrangler deployed the Worker and uploaded its Gemini secret.
// Update the public config only after a real generation request succeeds.
export async function connectPages(
  workerURL,
  {
    fetcher = globalThis.fetch,
    save = (content) =>
      writeFile(new URL("../config.js", import.meta.url), content),
  } = {},
) {
  const url = new URL(workerURL);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".workers.dev") ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    throw new Error("Expected the HTTPS workers.dev URL returned by Wrangler");
  }
  const endpoint = new URL("/api/chat", url).href;
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: SITE_ORIGIN },
    body: JSON.stringify({
      messages: [{ role: "user", text: "Ответьте одним словом: готово." }],
    }),
    signal: AbortSignal.timeout(40000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.reply !== "string" || !data.reply.trim()) {
    const codes = new Set([
      "not_configured",
      "model_not_found",
      "provider_auth",
      "rate_limited",
      "timeout",
      "upstream_unavailable",
    ]);
    throw new Error(
      `Worker check failed (HTTP ${response.status}, ${codes.has(data.error) ? data.error : "invalid_response"}). Public configuration was not changed.`,
    );
  }
  if (typeof data.model !== "string" || !data.model.startsWith("gemini-3")) {
    throw new Error(
      "Worker did not confirm a Gemini 3 model. Public configuration was not changed.",
    );
  }
  if (data.usage) {
    const usageRecord = JSON.stringify({
      event: "deployment_token_usage",
      model: data.model,
      usage: data.usage,
    });
    console.info(usageRecord);
    if (process.env.GITHUB_ACTIONS === "true")
      console.info(`::notice title=Gemini token usage::${usageRecord}`);
  }
  await save(
    `// Public API endpoint. API credentials stay in Cloudflare secrets.\nwindow.AGRO_CONFIG = ${JSON.stringify({ chatEndpoint: endpoint })};\n`,
  );
  return endpoint;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (!process.env.WORKER_URL) throw new Error("WORKER_URL is required");
    const endpoint = await connectPages(process.env.WORKER_URL);
    console.log(`Gemini Worker verified. Saved public endpoint: ${endpoint}`);
  } catch (error) {
    console.error(
      process.env.GITHUB_ACTIONS === "true"
        ? `::error::${error.message}`
        : error.message,
    );
    process.exitCode = 1;
  }
}
