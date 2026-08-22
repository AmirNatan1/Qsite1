import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.resolve(ROOT, "dist");
const argumentsList = process.argv.slice(2);

function argument(flag, fallback) {
  const index = argumentsList.indexOf(flag);
  return index >= 0 ? argumentsList[index + 1] ?? fallback : fallback;
}

const host = argument("--host", "127.0.0.1");
const port = Number.parseInt(argument("--port", "4334"), 10);
const mime = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webm": "video/webm",
  ".xml": "application/xml; charset=utf-8",
});

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return { invalid: true };
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number.parseInt(match[2], 10);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return { invalid: true };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number.parseInt(match[1], 10);
    end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
    return { invalid: true };
  }
  return { start, end: Math.min(end, size - 1) };
}

async function resolveRequest(pathname) {
  const relative = pathname === "/"
    ? "index.html"
    : pathname.endsWith("/")
      ? `${pathname.slice(1)}index.html`
      : pathname.slice(1);
  const candidate = path.resolve(DIST, relative);
  if (!isWithin(DIST, candidate)) return null;
  try {
    const resolved = await realpath(candidate);
    if (!isWithin(await realpath(DIST), resolved)) return null;
    const information = await stat(resolved);
    return information.isFile() ? { path: resolved, status: 200, size: information.size } : null;
  } catch {
    const fallback = path.join(DIST, "404.html");
    const information = await stat(fallback);
    return { path: fallback, status: 404, size: information.size };
  }
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", `http://${host}`).pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const resolved = await resolveRequest(pathname);
  if (!resolved) {
    response.writeHead(403).end();
    return;
  }
  const range = resolved.status === 200 ? parseRange(request.headers.range, resolved.size) : null;
  if (range?.invalid) {
    response.writeHead(416, {
      "accept-ranges": "bytes",
      "content-range": `bytes */${resolved.size}`,
    }).end();
    return;
  }
  const headers = {
    "accept-ranges": "bytes",
    "cache-control":
      resolved.status === 200 && pathname.startsWith("/media/cinematic/")
        ? "public, max-age=31556952, immutable"
        : "no-store",
    "content-type": mime[path.extname(resolved.path).toLowerCase()] ?? "application/octet-stream",
    "x-content-type-options": "nosniff",
  };
  const statusCode = range ? 206 : resolved.status;
  if (range) {
    headers["content-length"] = String(range.end - range.start + 1);
    headers["content-range"] = `bytes ${range.start}-${range.end}/${resolved.size}`;
  } else {
    headers["content-length"] = String(resolved.size);
  }
  response.writeHead(statusCode, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(resolved.path, range ? { start: range.start, end: range.end } : undefined)
    .on("error", () => response.destroy())
    .pipe(response);
});

server.listen(port, host, () => {
  console.log(`Phase 4 dist server ready at http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
