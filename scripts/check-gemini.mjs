import { fileURLToPath } from "node:url";
import {
  DEFAULT_MODEL,
  providerFailureReason,
  handleChat,
  safeProviderReason,
  safeProviderStatus,
} from "../chat.mjs";

// Model metadata is read-only: no prompt, generated answer or generation tokens.
export async function checkGeminiAccess(env, fetcher = globalThis.fetch) {
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  if (!env.GEMINI_API_KEY || !/^gemini-3[\w.-]*$/.test(model))
    throw new Error("A Gemini key and a valid Gemini 3 model are required.");
  let response;
  try {
    response = await fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}`,
      {
        method: "GET",
        headers: { "x-goog-api-key": env.GEMINI_API_KEY },
        signal: AbortSignal.timeout(30000),
      },
    );
  } catch {
    throw new Error("Gemini model metadata request could not be completed.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = providerFailureReason(data);
    throw new Error(
      `Gemini model access failed (HTTP ${response.status}${reason ? ", " + reason : ""}). No generation request was made.`,
    );
  }
  if (
    data.name !== `models/${model}` ||
    !data.supportedGenerationMethods?.includes("generateContent")
  )
    throw new Error(
      "Configured Gemini 3 model did not confirm generateContent support.",
    );
  return model;
}

// Explicit diagnostic after a Worker generation failure: one direct request,
// using the same shared handler and token ceiling, to isolate provider access.
export async function checkGeminiGeneration(env, fetcher = globalThis.fetch) {
  const origin = "https://ama228061.github.io";
  const response = await handleChat(
    new Request("https://diagnostic.invalid/api/chat", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", text: "Ответьте одним словом: готово." }],
      }),
    }),
    { ...env, ALLOWED_ORIGIN: origin },
    fetcher,
    () => {},
  );
  const data = await response.json();
  if (!response.ok) {
    const reason = safeProviderReason(data.providerReason);
    const status = safeProviderStatus(data.providerStatus);
    throw new Error(
      `Direct Gemini generation failed (HTTP ${response.status}${reason ? ", " + reason : ""}${status ? ", " + status : ""}).`,
    );
  }
  return { model: data.model, usage: data.usage };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const prefix = process.env.GITHUB_ACTIONS === "true" ? "::notice::" : "";
    if (process.argv.includes("--generation")) {
      const result = await checkGeminiGeneration(process.env);
      console.info(
        `${prefix}Direct Gemini generation succeeded from GitHub Actions: ${JSON.stringify(result)}`,
      );
    } else {
      const model = await checkGeminiAccess(process.env);
      console.info(
        `${prefix}Gemini key and ${model} model metadata access verified without generation.`,
      );
    }
  } catch (error) {
    console.error(
      `${process.env.GITHUB_ACTIONS === "true" ? "::error::" : ""}${error.message}`,
    );
    process.exitCode = 1;
  }
}
