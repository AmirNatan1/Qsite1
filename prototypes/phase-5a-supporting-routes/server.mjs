// QH_PHASE5A_ROUTE_LAB_ONLY
import { createReadStream, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { routeForPath } from "./route-data.mjs";
import { renderRoute, renderSystem } from "./render-route.mjs";

const prototypeRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const repositoryRoot = resolve(prototypeRoot, "..", "..");
const publicRoot = join(repositoryRoot, "public");
const portArgument = process.argv.find((argument) => argument.startsWith("--port="));
const port = Number.parseInt(portArgument?.slice(7) ?? process.env.PHASE5A_ROUTE_PORT ?? "4175", 10);
const boardNames = new Set(["page", "motion", "materials", "type", "transition"]);

const staticRoutes = [
  { prefix: "/shared/", root: join(prototypeRoot, "shared") },
  { prefix: "/fonts/", root: join(publicRoot, "fonts") },
  { prefix: "/media/maradin/", root: join(publicRoot, "media", "maradin") },
].map((route) => ({ ...route, root: resolve(route.root) }));

const mime = {
  ".css": "text/css; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const headers = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'self'; base-uri 'none'; connect-src 'none'; frame-ancestors 'none'; img-src 'self' data:; media-src 'none'; object-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; form-action 'none'",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-phase5a-local-prototype": "QH_PHASE5A_ROUTE_LAB_ONLY",
};

function within(root, candidate) {
  const fromRoot = relative(root, candidate);
  return fromRoot === "" || (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`));
}

function serveStatic(pathname, request, response) {
  const route = staticRoutes.find(({ prefix }) => pathname.startsWith(prefix));
  if (!route) return false;
  const candidate = resolve(route.root, pathname.slice(route.prefix.length));
  try {
    if (!within(route.root, candidate)) throw new Error("Outside root");
    const realRoot = realpathSync(route.root);
    const realFile = realpathSync(candidate);
    if (!within(realRoot, realFile)) throw new Error("Symlink escape");
    const stats = statSync(realFile);
    if (!stats.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      ...headers,
      "content-length": stats.size,
      "content-type": mime[extname(realFile).toLowerCase()] ?? "application/octet-stream",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(realFile).pipe(response);
  } catch {
    response.writeHead(404, { ...headers, "content-type": "text/plain; charset=utf-8" }).end("Not found");
  }
  return true;
}

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { ...headers, allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" }).end("Method not allowed");
    return;
  }

  let url;
  try {
    url = new URL(request.url ?? "/", "http://127.0.0.1");
  } catch {
    response.writeHead(400, { ...headers, "content-type": "text/plain; charset=utf-8" }).end("Bad request");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400, { ...headers, "content-type": "text/plain; charset=utf-8" }).end("Bad request");
    return;
  }

  if (serveStatic(pathname, request, response)) return;

  const route = routeForPath(pathname);
  const boardName = url.searchParams.get("board") ?? "page";
  let html;
  if (pathname === "/system/") html = renderSystem();
  else if (route && boardNames.has(boardName)) html = renderRoute(route, boardName);
  else {
    response.writeHead(404, { ...headers, "content-type": "text/plain; charset=utf-8" }).end("Local prototype route not found");
    return;
  }

  const bytes = Buffer.from(html);
  response.writeHead(200, {
    ...headers,
    "content-length": bytes.length,
    "content-type": "text/html; charset=utf-8",
  });
  if (request.method === "HEAD") response.end();
  else response.end(bytes);
});

server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const boundPort = typeof address === "object" && address ? address.port : port;
  console.log(`Phase 5A supporting-route lab: http://127.0.0.1:${boundPort}/for-partners/`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
