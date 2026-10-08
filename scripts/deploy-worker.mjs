import { spawnSync } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Report only known diagnostic fields; CLI output may contain account details.
export function deploymentResult(result) {
  if (result.status !== 0) {
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    const codes = [
      ...new Set([...output.matchAll(/\[code:\s*(\d+)\]/g)].map((m) => m[1])),
    ];
    const categories = [
      [
        /authentication error|unauthori[sz]ed|insufficient permission|permission denied/i,
        "authentication or permissions",
      ],
      [/compatibility.date/i, "compatibility date"],
      [/subdomain/i, "Workers subdomain"],
      [/binding/i, "Worker bindings"],
    ]
      .filter(([pattern]) => pattern.test(output))
      .map(([, label]) => label);
    throw new Error(
      `Wrangler deployment failed (exit ${Number.isInteger(result.status) ? result.status : "unavailable"}; Cloudflare codes: ${codes.join(", ") || "unreported"}; diagnostics: ${categories.join(", ") || "unreported"}).`,
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
    const url = deploymentResult(result);
    if (process.env.GITHUB_OUTPUT)
      await appendFile(process.env.GITHUB_OUTPUT, `deployment-url=${url}\n`);
    console.info(`::notice::Worker deployed: ${url}`);
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
