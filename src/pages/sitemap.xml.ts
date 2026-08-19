import type { APIRoute } from "astro";

const routes = [
  "/",
  "/for-partners/",
  "/for-startups/",
  "/industries/",
  "/pocs/",
  "/pocs/maradin/",
  "/spark/",
  "/about/",
  "/contact/",
] as const;

export const GET: APIRoute = ({ site }) => {
  if (!site) return new Response("Site origin is not configured.", { status: 503 });

  const urls = routes
    .map((route) => `  <url><loc>${new URL(route, site).toString()}</loc></url>`)
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
