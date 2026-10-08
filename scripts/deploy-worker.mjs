import { spawnSync } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

export async function deployUsingREST(config, env, fetcher = globalThis.fetch) {
  const accountPath = `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers`;
  async function request(path, options, label) {
    const response = await fetcher(
      `https://api.cloudflare.com/client/v4${path}`,
      {
        ...options,
        headers: {
          ...options?.headers,
          Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        },
        signal: AbortSignal.timeout(30000),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success !== true) {
      const codes = (Array.isArray(data.errors) ? data.errors : [])
        .map((error) => Number(error.code))
        .filter(Number.isSafeInteger);
      throw new Error(
        `${label} failed (HTTP ${response.status}; Cloudflare codes: ${codes.join(", ") || "unreported"}).`,
      );
    }
    return data.result;
  }
  const form = new FormData();
  form.set(
    "metadata",
    JSON.stringify({
      main_module: "worker.mjs",
      compatibility_date: config.compatibility_date,
      bindings: [
        ...Object.entries(config.vars).map(([name, text]) => ({
          name,
          text,
          type: "plain_text",
        })),
        ...config.ratelimits.map((binding) => ({
          ...binding,
          type: "ratelimit",
        })),
      ],
      observability: config.observability,
      keep_bindings: ["secret_text", "secret_key"],
    }),
  );
  for (const name of ["worker.mjs", "chat.mjs"])
    form.set(
      name,
      new File([await readFile(new URL(`../${name}`, import.meta.url))], name, {
        type: "application/javascript+module",
      }),
    );
  await request(
    `${accountPath}/scripts/${config.name}`,
    { method: "PUT", body: form },
    "Cloudflare REST Worker upload",
  );
  const result = await request(
    `${accountPath}/subdomain`,
    {},
    "Cloudflare Workers subdomain lookup",
  );
  if (
    typeof result?.subdomain !== "string" ||
    !/^[a-z0-9-]{1,63}$/.test(result.subdomain)
  )
    throw new Error(
      "Register a Workers subdomain in Cloudflare Workers & Pages before connecting the site.",
    );
  await request(
    `${accountPath}/scripts/${config.name}/subdomain`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    },
    "Cloudflare workers.dev activation",
  );
  return `https://${config.name}.${result.subdomain}.workers.dev`;
}

// Report only known diagnostic fields; CLI output may contain account details.
export function deploymentResult(result, redactions = []) {
  if (result.status !== 0) {
    const output = stripVTControlCharacters(
      `${result.stdout || ""}\n${result.stderr || ""}`,
    );
    const codes = [
      ...new Set(
        [
          ...output.matchAll(/(?:\[code:|"code"\s*:|error code:)\s*"?(\d+)/gi),
        ].map((m) => m[1]),
      ),
    ];
    const errorStart = output.indexOf("[ERROR]");
    let detail =
      errorStart >= 0
        ? output
            .slice(errorStart + "[ERROR]".length)
            .split(/\n\s*\n/)
            .slice(0, 3)
            .join(" ")
        : String(result.stderr || "")
            .split("\n")
            .find((line) => line.trim()) || "unreported";
    for (const value of redactions.filter(
      (value) => typeof value === "string" && value,
    ))
      detail = detail.split(value).join("[redacted]");
    detail = detail.replace(/[\r\n]+/g, " ").slice(0, 1000);
    const categories = [
      [
        /authentication error|unauthori[sz]ed|insufficient permission|permission denied|no access to the specified resource/i,
        "authentication or permissions",
      ],
      [/compatibility.date/i, "compatibility date"],
      [/subdomain/i, "Workers subdomain"],
      [/binding/i, "Worker bindings"],
    ]
      .filter(([pattern]) => pattern.test(detail))
      .map(([, label]) => label);
    throw new Error(
      `Wrangler deployment failed (exit ${Number.isInteger(result.status) ? result.status : "unavailable"}; Cloudflare codes: ${codes.join(", ") || "unreported"}; diagnostics: ${categories.join(", ") || "unreported"}). ${detail}`,
    );
  }
  const urls =
    String(result.stdout || "").match(
      /https:\/\/[a-zA-Z0-9.-]+\.workers\.dev/g,
    ) || [];
  const url = urls.find((value) =>
    new URL(value).hostname.startsWith("agro-assistant."),
  );
  if (!url)
    throw new Error(
      "Wrangler did not return the deployed agro-assistant workers.dev URL.",
    );
  return url;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = spawnSync("npx", ["--no-install", "wrangler", "deploy"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
    });
    let url;
    try {
      url = deploymentResult(result, [
        process.env.CLOUDFLARE_API_TOKEN,
        process.env.GEMINI_API_KEY,
      ]);
    } catch (error) {
      if (process.env.GITHUB_ACTIONS !== "true") throw error;
      console.info(
        "::warning::Wrangler deployment failed; checking the official Cloudflare REST upload with the same configured permissions.",
      );
      const { unstable_readConfig } = await import("wrangler");
      url = await deployUsingREST(
        unstable_readConfig({ config: "wrangler.jsonc" }),
        process.env,
      );
    }
    if (process.env.GITHUB_OUTPUT)
      await appendFile(process.env.GITHUB_OUTPUT, `deployment-url=${url}\n`);
    console.info(`::notice::Worker deployed: ${url}`);
  } catch (error) {
    const message = error.message
      .replaceAll("%", "%25")
      .replaceAll("\r", "%0D")
      .replaceAll("\n", "%0A");
    console.error(`::error::${message}`);
    process.exitCode = 1;
  }
}
