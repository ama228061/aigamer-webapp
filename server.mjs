import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import { Readable } from "node:stream";
import { handleChat, jsonResponse } from "./chat.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicFiles = new Set([
  "index.html",
  "styles.css",
  "app.js",
  "config.js",
  "favicon.png",
  "flutter_service_worker.js",
]);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};
const limits = new Map();
function limited(key) {
  const now = Date.now();
  if (limits.size > 10000)
    for (const [ip, entry] of limits) if (entry.until < now) limits.delete(ip);
  let entry = limits.get(key);
  if (!entry || entry.until < now) {
    entry = { count: 0, until: now + 60000 };
    limits.set(key, entry);
  }
  return ++entry.count > 15;
}

export function createApp(env = process.env, fetcher = globalThis.fetch) {
  return createServer(async (req, res) => {
    try {
      const origin = `http://${req.headers.host}`;
      const url = new URL(req.url, origin);
      let path = decodeURIComponent(url.pathname);
      if (path.startsWith("/aigamer-webapp/"))
        path = path.slice("/aigamer-webapp".length);
      if (path === "/api/chat") {
        const request = new Request(url, {
          method: req.method,
          headers: req.headers,
          ...(req.method === "POST"
            ? { body: Readable.toWeb(req), duplex: "half" }
            : {}),
        });
        const response =
          req.method === "POST" && limited(req.socket.remoteAddress)
            ? jsonResponse({ error: "rate_limited" }, 429, origin)
            : await handleChat(
                request,
                { ...env, ALLOWED_ORIGIN: env.ALLOWED_ORIGIN || origin },
                fetcher,
              );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405);
        res.end();
        return;
      }
      const relative = path === "/" ? "index.html" : path.slice(1);
      const filename = resolve(root, relative);
      const asset =
        /^(?:assets\/assets|icons)\/[a-zA-Z0-9_./-]+\.(?:jpg|png)$/.test(
          relative,
        );
      if (
        !filename.startsWith(root + (root.endsWith(sep) ? "" : sep)) ||
        (!publicFiles.has(relative) && !asset)
      ) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const body = await readFile(filename);
      res.writeHead(200, {
        "Content-Type": mime[extname(filename)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 400, {
        "Content-Type": "text/plain",
      });
      res.end("Request failed");
    }
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 8000);
  const host = process.env.HOST || "127.0.0.1";
  createApp().listen(port, host, () =>
    console.log(
      `AG development server listening on port ${port}. Gemini key: ${process.env.GEMINI_API_KEY ? "configured" : "missing"}.`,
    ),
  );
}
