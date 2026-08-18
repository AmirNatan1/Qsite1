import { createReadStream, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";

const repositoryRoot = resolve(process.cwd());
const prototypeUrl = "/prototypes/phase-0-spiral-field/";
const allowedRoots = [
  join(repositoryRoot, "prototypes", "phase-0-spiral-field"),
  join(repositoryRoot, "prototypes", "phase-0-3d-media-spike"),
  join(repositoryRoot, "prototypes", "phase-0-portal-layout-qa"),
  join(repositoryRoot, "prototypes", "phase-0-4-crt-portal-qa"),
  join(repositoryRoot, "artifacts", "original", "phase-0"),
  join(repositoryRoot, "artifacts", "original", "phase-0-3d-repair-v2"),
  join(repositoryRoot, "artifacts", "original", "phase-0-3d-repair-v3"),
  join(repositoryRoot, "artifacts", "original", "phase-0-4-crt-television"),
  join(repositoryRoot, "artifacts", "original", "phase-0-3d-repair", "media"),
  join(repositoryRoot, "artifacts", "original", "phase-0-3d-repair", "review"),
].map((root) => resolve(root));
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webm": "video/webm",
  ".zip": "application/zip",
};

const commonHeaders = {
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'self'; base-uri 'none'; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; object-src 'none'; script-src 'self'; style-src 'self'; frame-ancestors 'none'",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

function headersForPath(pathname) {
  if (
    !pathname.startsWith("/prototypes/phase-0-portal-layout-qa/") &&
    !pathname.startsWith("/prototypes/phase-0-4-crt-portal-qa/")
  ) return commonHeaders;
  return {
    ...commonHeaders,
    "content-security-policy":
      "default-src 'self'; base-uri 'none'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; img-src 'self' data:; media-src 'self' blob:; object-src 'none'; script-src 'self'; style-src 'self'",
    "x-frame-options": "SAMEORIGIN",
  };
}

function isWithin(root, candidate) {
  const fromRoot = relative(root, candidate);
  return fromRoot === "" || (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot));
}

function parseByteRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return { invalid: true };

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number.parseInt(match[2], 10);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { invalid: true };
    start = Math.max(0, size - suffixLength);
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

createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { ...commonHeaders, allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
  } catch {
    response.writeHead(400, { ...commonHeaders, "content-type": "text/plain; charset=utf-8" }).end("Bad request");
    return;
  }

  if (pathname === "/") {
    response.writeHead(302, { ...commonHeaders, location: prototypeUrl }).end();
    return;
  }

  const pathHeaders = headersForPath(pathname);

  const requested = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
  const absolute = resolve(repositoryRoot, requested);
  const allowedRoot = allowedRoots.find((root) => isWithin(root, absolute));
  if (!allowedRoot) {
    response.writeHead(403, { ...pathHeaders, "content-type": "text/plain; charset=utf-8" }).end("Forbidden");
    return;
  }

  try {
    const realRoot = realpathSync(allowedRoot);
    const realFile = realpathSync(absolute);
    if (!isWithin(realRoot, realFile)) {
      response.writeHead(403, { ...pathHeaders, "content-type": "text/plain; charset=utf-8" }).end("Forbidden");
      return;
    }

    const file = statSync(realFile);
    if (!file.isFile()) throw new Error("Not a file");

    const range = parseByteRange(request.headers.range, file.size);
    if (range?.invalid) {
      response
        .writeHead(416, {
          ...pathHeaders,
          "accept-ranges": "bytes",
          "content-range": `bytes */${file.size}`,
          "content-type": "text/plain; charset=utf-8",
        })
        .end("Range not satisfiable");
      return;
    }

    const headers = {
      ...pathHeaders,
      "accept-ranges": "bytes",
      "content-type": mime[extname(realFile).toLowerCase()] ?? "application/octet-stream",
    };
    const status = range ? 206 : 200;
    if (range) {
      headers["content-length"] = String(range.end - range.start + 1);
      headers["content-range"] = `bytes ${range.start}-${range.end}/${file.size}`;
    } else {
      headers["content-length"] = String(file.size);
    }

    response.writeHead(status, headers);
    if (request.method === "HEAD") {
      response.end();
      return;
    }

    const stream = createReadStream(realFile, range ? { start: range.start, end: range.end } : undefined);
    stream.on("error", () => response.destroy());
    stream.pipe(response);
  } catch {
    response.writeHead(404, { ...pathHeaders, "content-type": "text/plain; charset=utf-8" }).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Spiral Conduction prototype: http://127.0.0.1:${port}${prototypeUrl}`);
  console.log(`3D media seek spike: http://127.0.0.1:${port}/prototypes/phase-0-3d-media-spike/`);
  console.log(`Portal typography QA: http://127.0.0.1:${port}/prototypes/phase-0-portal-layout-qa/`);
  console.log(`CRT portal typography QA: http://127.0.0.1:${port}/prototypes/phase-0-4-crt-portal-qa/`);
});
