// Builds home.seiza.cc from index.html (the template), so the page keeps up
// with the repository. Writes public/index.html and public/sitemap.xml:
//
// - The worlds: Seiza and every world its portals go to, from
//   public/worlds/default/world.json. A new portal shows up on the page.
// - What's new: the months written before it was automatic
//   (changelog.json), plus every commit since its `through` date, in plain
//   words (see item()).
//
//   node home/build.mjs
//
// Nothing to install: plain Node. Where git history isn't there (a shallow
// clone), the changelog is just the hand-written part.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const here = (path) => new URL(path, import.meta.url);
const read = (path) => JSON.parse(readFileSync(here(path), "utf8"));

// --- worlds ---------------------------------------------------------------------

const seiza = read("../public/worlds/default/world.json");
const portals = seiza.portals ?? { worlds: [] };
const worlds = [
  {
    name: "Seiza",
    url: "https://seiza.cc",
    color: "#e8c37a",
    blurb: "The home world: a hall, a classroom, a pond, a meadow with a campsite, and the beach.",
  },
  ...portals.worlds.map((w) => ({
    name: w.label,
    url: w.url ?? portals.urlPattern.replace("{id}", w.id),
    color: w.color,
    blurb: w.blurb,
  })),
];

// --- what's new ---------------------------------------------------------------------

const log = read("changelog.json");
let commits = [];
try {
  const out = execFileSync("git", ["log", `--since=${log.through}T23:59:59`, "--no-merges", "--date=short", "--pretty=%ad%x09%s"], {
    cwd: new URL(".", import.meta.url),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  commits = out.trim() ? out.trim().split("\n").map((line) => line.split("\t")) : [];
} catch {
  // No git, or no history: the hand-written changelog stands alone.
}

// Plain words for visitors. Commit messages are written for contributors,
// so each one is trimmed to its first point, its world named, and the few
// technical words that turn up swapped for everyday ones.
const WORLD_NAMES = Object.fromEntries(portals.worlds.map((w) => [w.id, w.label]));
const PLAIN = [
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
const AREAS = { xr: "In VR", i18n: "Languages", chat: "Chat", guides: "Guides", portals: "Portals", designer: "Avatar designer" };

/** "feat(seiou): lifts on every floor; ..." → { tag: "new", text: "SeiOU: lifts on every floor." }.
 *  Only features and fixes are news to visitors. */
function item(subject) {
  const match = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/.exec(subject);
  if (!match) return null;
  const [, type, scope = "", body] = match;
  if (type !== "feat" && type !== "fix") return null;
  if (/^(worker|deps|ci|build|test|docs)$/.test(scope)) return null;
  // The first point only, without asides in brackets.
  let text = body.split(/;\s|\s—\s/)[0].replace(/\s*\([^)]*\)/g, "").trim();
  for (const [pattern, word] of PLAIN) text = text.replace(pattern, word);
  const places = scope.split(/,\s*/).map((s) => WORLD_NAMES[s] ?? AREAS[s]).filter(Boolean);
  text = text.charAt(0).toUpperCase() + text.slice(1);
  if (places.length) text = `${places.join(" and ")}: ${text}`;
  return { tag: type === "feat" ? "new" : "better", text: /[.!?]$/.test(text) ? text : `${text}.` };
}

const months = log.months.map((m) => ({ ...m, items: [...m.items] }));
for (const [date, subject] of commits.reverse()) {
  const entry = item(subject);
  if (!entry) continue;
  if (months.some((m) => m.items.some((i) => i.text === entry.text))) continue;
  const month = date.slice(0, 7);
  let block = months.find((m) => m.month === month);
  if (!block) months.push((block = { month, items: [] }));
  // Newest first within a month, ahead of the hand-written items.
  block.items.unshift(entry);
}
months.sort((a, b) => b.month.localeCompare(a.month));

// --- the page ----------------------------------------------------------------------
// Everything is written into the HTML itself, not fetched by script, so
// search engines and link previews see the worlds and the news, and the
// page works without JavaScript.

const SITE = "https://home.seiza.cc/";
const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TAGS = { new: "New", world: "World", better: "Better" };

const worldCards = worlds
  .map(
    (w) => `      <a class="world" href="${esc(w.url)}" style="--c: ${esc(w.color)}" aria-label="${esc(`${w.name}: ${w.blurb}`)}">
        <span class="ring" aria-hidden="true"></span>
        <h3>${esc(w.name)}</h3>
        <p>${esc(w.blurb)}</p>
        <span class="go">${esc(w.url.replace("https://", ""))} →</span>
      </a>`
  )
  .join("\n");

const changes = months
  .map(({ month, items }) => {
    const [y, m] = month.split("-").map(Number);
    const list = items.map((i) => `          <li><span class="tag ${esc(i.tag)}">${esc(TAGS[i.tag] ?? i.tag)}</span><span>${esc(i.text)}</span></li>`).join("\n");
    return `      <div class="month">
        <h3><time datetime="${esc(month)}">${MONTH_NAMES[m - 1]} ${y}</time></h3>
        <ul>
${list}
        </ul>
      </div>`;
  })
  .join("\n");

// Structured data: what Seiza is, who made it, and the worlds, for search
// results that show it as software and list the worlds.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE}#site`,
      url: SITE,
      name: "Seiza",
      alternateName: ["SeizaXR", "正座", "星座"],
      inLanguage: ["en", "ja"],
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE}#app`,
      name: "Seiza",
      url: SITE,
      applicationCategory: "EducationalApplication",
      applicationSubCategory: "Multiplayer WebXR",
      operatingSystem: "Web browser: Windows, macOS, Linux, Android, iOS, Meta Quest",
      description:
        "Free, open-source multiplayer WebXR for learning: shared 3D worlds where a class meets as avatars, from a phone, a laptop, or a VR headset, hosted on the school's own Cloudflare account.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      isAccessibleForFree: true,
      inLanguage: ["en", "ja"],
      featureList: [
        "Spatial voice chat and screen sharing",
        "VRM avatars, an avatar designer, and Avaturn avatars",
        "VR body tracking on headsets",
        "Gestures and consent-based together gestures",
        "English and Japanese",
        "Self-hosted on Cloudflare Workers",
      ],
      author: { "@id": `${SITE}#author` },
      sameAs: ["https://github.com/yesiamalex/Seiza", "https://seiza.cc"],
    },
    {
      "@type": "SoftwareSourceCode",
      name: "Seiza source code",
      codeRepository: "https://github.com/yesiamalex/Seiza",
      programmingLanguage: "TypeScript",
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      author: { "@id": `${SITE}#author` },
    },
    {
      "@type": "Person",
      "@id": `${SITE}#author`,
      name: "Ziedell Alexander Figueroa",
      url: "https://zafigueroa.vercel.app",
      jobTitle: "Full-stack and XR developer",
      sameAs: ["https://github.com/yesiamalex"],
    },
    {
      "@type": "ItemList",
      name: "Seiza worlds",
      itemListElement: worlds.map((w, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: { "@type": "VirtualLocation", name: w.name, url: w.url, description: w.blurb },
      })),
    },
  ],
};

const template = readFileSync(here("index.html"), "utf8");
const page = template
  .replace("<!--JSONLD-->", `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`)
  .replace("<!--WORLDS-->", worldCards)
  .replace("<!--CHANGES-->", changes)
  .replaceAll("<!--WORLD_COUNT-->", String(worlds.length));
writeFileSync(here("public/index.html"), page);

const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  here("public/sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
</urlset>
`
);


console.log(`home: ${worlds.length} worlds, ${commits.length} new commit(s) since ${log.through}`);
