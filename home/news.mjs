// How a commit reads in "What's new", in plain words for visitors. Shared:
// build.mjs words the history with it at deploy, and the page imports the
// same file (copied to public/news.mjs) to word commits made since.
//
// Commit messages are written for contributors, so each one is trimmed to
// its first point, its world named, and the few technical words that turn
// up swapped for everyday ones. Only features and fixes are news.

export const PLAIN = [
  [/\bVRMs?\b/g, "avatars"],
  [/\bWebXR\b/g, "VR"],
  [/\bnavmesh(es)?\b/gi, "walking paths"],
  [/\bxr\b/g, "VR"],
  [/\bi18n\b/g, "languages"],
  [/\bIK\b/g, "arm movement"],
  [/\bHUD\b/g, "on-screen controls"],
  [/\bKV\b/g, "storage"],
  [/\bDurable Objects?\b/g, "room server"],
  [/\bWorkers?\b/g, "server"],
];

/** Scopes that aren't a place in the world, named for what they mean to a visitor. */
export const AREAS = { xr: "In VR", i18n: "Languages", chat: "Chat", guides: "Guides", portals: "Portals", designer: "Avatar designer" };

/** Scopes that aren't news to visitors: the plumbing, and this page itself. */
const QUIET = /^(worker|deps|ci|build|test|docs|home)$/;

/**
 * "feat(seiou): lifts on every floor; ..." → { tag: "new", text: "SeiOU: lifts on every floor." },
 * given the worlds' names by id. Anything else (a merge, a chore) → null.
 */
export function item(subject, worldNames = {}) {
  const match = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/.exec(subject);
  if (!match) return null;
  const [, type, scope = "", body] = match;
  if (type !== "feat" && type !== "fix") return null;
  if (QUIET.test(scope)) return null;
  // The first point only, without asides in brackets.
  let text = body.split(/;\s|\s—\s/)[0].replace(/\s*\([^)]*\)/g, "").trim();
  for (const [pattern, word] of PLAIN) text = text.replace(pattern, word);
  const places = scope
    .split(/,\s*/)
    .map((s) => worldNames[s] ?? AREAS[s])
    .filter(Boolean);
  text = text.charAt(0).toUpperCase() + text.slice(1);
  if (places.length) text = `${places.join(" and ")}: ${text}`;
  return { tag: type === "feat" ? "new" : "better", text: /[.!?]$/.test(text) ? text : `${text}.` };
}
