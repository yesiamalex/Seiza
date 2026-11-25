// admin.seiza.cc: Seiza's research dashboard, behind Cloudflare Access.
//
// Every request must carry Access's signed login (the Cf-Access-Jwt-Assertion
// header, put there by Access once someone you allowed signs in). This
// Worker checks that signature itself against your Access team's public
// keys, the audience, the issuer, and the expiry, so even a request that
// somehow skipped Access gets nothing. Then it serves the page, and
// /api/summary, which asks each world for its counts (worker/stats.ts)
// with the shared SEIZA_STATS_TOKEN. Nothing is stored here.

export default {
  async fetch(request, env) {
    const who = await signedIn(request, env);
    if (!who) return new Response("Sign in through Cloudflare Access to see this.", { status: 403 });
    const url = new URL(request.url);
    if (url.pathname === "/api/summary") return summary(env);
    const page = await env.ASSETS.fetch(request);
    const headers = new Headers(page.headers);
    headers.set("cache-control", "no-store");
    headers.set("x-frame-options", "DENY");
    headers.set("referrer-policy", "no-referrer");
    return new Response(page.body, { status: page.status, headers });
  },
};

const base64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
let certs = null;

/** The signed-in person's email, if Access vouches for them; else null. */
async function signedIn(request, env) {
  const team = env.ACCESS_TEAM;
  const aud = env.ACCESS_AUD;
  const jwt = request.headers.get("cf-access-jwt-assertion");
  if (!team || !aud || !jwt) return null;
  const [head, body, signature] = jwt.split(".");
  if (!signature) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(base64url(head)));
    const claims = JSON.parse(new TextDecoder().decode(base64url(body)));
    const issuer = `https://${team}.cloudflareaccess.com`;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== issuer || !audiences.includes(aud) || !(claims.exp * 1000 > Date.now())) return null;
    if (!certs || certs.at < Date.now() - 3600_000) certs = { at: Date.now(), keys: (await (await fetch(`${issuer}/cdn-cgi/access/certs`)).json()).keys };
    const jwk = certs.keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64url(signature), new TextEncoder().encode(`${head}.${body}`));
    return ok ? (claims.email ?? "admin") : null;
  } catch {
    return null;
  }
}

/** Each world's counts, as it gave them: every kept day, and today so far. */
async function summary(env) {
  let worlds = [];
  try {
    worlds = JSON.parse(env.SEIZA_WORLDS ?? "[]");
  } catch {
    return Response.json({ error: "SEIZA_WORLDS isn't valid JSON." }, { status: 500 });
  }
  const results = await Promise.all(
    worlds.map(async (w) => {
      try {
        const response = await fetch(new URL("/api/stats", w.url), { headers: { authorization: `Bearer ${env.SEIZA_STATS_TOKEN ?? ""}` } });
        if (response.status === 404) return { ...w, days: null, note: "Not counting: no matching SEIZA_STATS_TOKEN on that world." };
        if (!response.ok) return { ...w, days: null, note: `It answered ${response.status}.` };
        return { ...w, days: await response.json() };
      } catch {
        return { ...w, days: null, note: "It didn't answer." };
      }
    })
  );
  return Response.json({ worlds: results, at: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}
