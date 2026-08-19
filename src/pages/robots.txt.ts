import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const sitemap = site ? `Sitemap: ${new URL("/sitemap.xml", site).toString()}\n` : "";
  return new Response(`User-agent: *\nAllow: /\n${sitemap}`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
