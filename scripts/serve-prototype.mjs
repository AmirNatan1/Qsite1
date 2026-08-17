import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const repositoryRoot = process.cwd();
const prototypeUrl = "/prototypes/phase-0-spiral-field/";
const allowedRoots = [
  join(repositoryRoot, "prototypes", "phase-0-spiral-field"),
  join(repositoryRoot, "artifacts", "original", "phase-0"),
];
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webm": "video/webm",
};

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", `http://${request.headers.host}`).pathname);
  if (pathname === "/") {
    response.writeHead(302, { location: prototypeUrl }).end();
    return;
  }

  const requested = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
  const absolute = normalize(join(repositoryRoot, requested));
  const isAllowed = allowedRoots.some((root) => absolute === root || absolute.startsWith(`${root}${sep}`));
  if (!isAllowed) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    if (!statSync(absolute).isFile()) throw new Error("Not a file");
    response.writeHead(200, { "content-type": mime[extname(absolute)] ?? "application/octet-stream" });
    createReadStream(absolute).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Spiral Conduction prototype: http://127.0.0.1:${port}${prototypeUrl}`);
});
