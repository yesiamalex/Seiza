// Moving a deployment to its own domain without breaking old links. See
// SEIZA_CANONICAL_ORIGIN in index.ts.

/** A page at the old *.workers.dev address, sent to the canonical one
 *  (SEIZA_CANONICAL_ORIGIN). Only page loads move: room connections and
 *  API calls from a page that's already open are answered where they are. */
export function canonicalRedirect(request: Request, url: URL, env: { SEIZA_CANONICAL_ORIGIN?: string }): Response | null {
  const target = env.SEIZA_CANONICAL_ORIGIN?.trim().replace(/\/+$/, "");
  if (!target || !/^https:\/\/[a-z0-9.-]+$/i.test(target)) return null;
  if (!url.hostname.endsWith(".workers.dev") || url.origin === target) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (url.pathname.startsWith("/rooms/") || url.pathname.startsWith("/api/")) return null;
  return Response.redirect(`${target}${url.pathname}${url.search}`, 301);
}
