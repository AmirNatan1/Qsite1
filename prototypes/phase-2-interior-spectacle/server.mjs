// QH_PHASE2A_LAB_ONLY
import { createReadStream, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const prototypeRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const repositoryRoot = resolve(prototypeRoot, "..", "..");
const publicRoot = join(repositoryRoot, "public");
const portArgument = process.argv.find((argument) => argument.startsWith("--port="));
const port = Number.parseInt(portArgument?.slice(7) ?? process.env.PHASE2A_PORT ?? "4174", 10);

const routes = [
  { prefix: "/brand/", root: join(publicRoot, "brand") },
  { prefix: "/fonts/", root: join(publicRoot, "fonts") },
  { prefix: "/media/maradin/", root: join(publicRoot, "media", "maradin") },
  { prefix: "/", root: prototypeRoot },
].map((route) => ({ ...route, root: resolve(route.root) }));

const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const headers = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'self'; base-uri 'none'; connect-src 'self'; frame-ancestors 'self'; img-src 'self' data:; media-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

function within(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`));
}

function resolveRequest(pathname) {
  if (pathname === "/" || pathname === "/index.html") return join(prototypeRoot, "index.html");
  const route = routes.find(({ prefix }) => pathname.startsWith(prefix));
  if (!route) return null;
  const suffix = pathname.slice(route.prefix.length);
  const candidate = resolve(route.root, suffix);
  return within(route.root, candidate) ? candidate : null;
}

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { ...headers, allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
  } catch {
    response.writeHead(400, { ...headers, "content-type": "text/plain; charset=utf-8" }).end("Bad request");
    return;
  }

  const candidate = resolveRequest(pathname);
  if (!candidate) {
    response.writeHead(403, { ...headers, "content-type": "text/plain; charset=utf-8" }).end("Forbidden");
    return;
  }

  try {
    const route = routes.find(({ root }) => within(root, candidate));
    if (!route) throw new Error("Outside allowed roots");
    const realRoot = realpathSync(route.root);
    const realFile = realpathSync(candidate);
    if (!within(realRoot, realFile)) throw new Error("Symlink escaped allowed root");
    const stat = statSync(realFile);
    if (!stat.isFile()) throw new Error("Not a file");

    response.writeHead(200, {
      ...headers,
      "content-length": stat.size,
      "content-type": mime[extname(realFile).toLowerCase()] ?? "application/octet-stream",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(realFile).pipe(response);
  } catch {
    response.writeHead(404, { ...headers, "content-type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const boundPort = typeof address === "object" && address ? address.port : port;
  console.log(`Phase 2A storyboard: http://127.0.0.1:${boundPort}/`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
