import { fileURLToPath } from "node:url";
import {
  DEFAULT_MODEL,
  providerFailureReason,
  handleChat,
  safeProviderReason,
  safeProviderStatus,
  reportedUsage,
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

export async function checkGeminiInteractions(env, fetcher = globalThis.fetch) {
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  if (!env.GEMINI_API_KEY || !/^gemini-3[\w.-]*$/.test(model))
    throw new Error("A Gemini key and a valid Gemini 3 model are required.");
  let response;
  try {
    response = await fetcher(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          model,
          input: "Ответьте одним словом: готово.",
          store: false,
          service_tier: "standard",
          generation_config: {
            max_output_tokens: 128,
            thinking_level: "minimal",
          },
        }),
        signal: AbortSignal.timeout(40000),
      },
    );
  } catch {
    throw new Error("Interactions request could not be completed.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = providerFailureReason(data);
    const status = safeProviderStatus(data.error?.status);
    throw new Error(
      `Interactions generation failed (HTTP ${response.status}${reason ? ", " + reason : ""}${status ? ", " + status : ""}).`,
    );
  }
  const text = Array.isArray(data.steps)
    ? data.steps
        .filter(
          (step) => step.type === "model_output" && Array.isArray(step.content),
        )
        .flatMap((step) =>
          step.content
            .filter(
              (part) => part.type === "text" && typeof part.text === "string",
            )
            .map((part) => part.text),
        )
        .join("\n")
        .trim()
    : "";
  if (!text || (data.model && data.model !== model))
    throw new Error(
      "Interactions did not return a text answer from the configured model.",
    );
  const usage = reportedUsage({
    promptTokenCount: data.usage?.total_input_tokens,
    candidatesTokenCount: data.usage?.total_output_tokens,
    thoughtsTokenCount: data.usage?.total_thought_tokens,
    cachedContentTokenCount: data.usage?.total_cached_tokens,
    totalTokenCount: data.usage?.total_tokens,
  });
  return { model, usage };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const prefix = process.env.GITHUB_ACTIONS === "true" ? "::notice::" : "";
    if (process.argv.includes("--interactions")) {
      const result = await checkGeminiInteractions(process.env);
      console.info(
        `${prefix}Standard-tier Interactions generation succeeded: ${JSON.stringify(result)}`,
      );
    } else if (process.argv.includes("--generation")) {
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
