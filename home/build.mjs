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
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { item } from "./news.mjs";

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
  // `through` is a day, or an exact time when a day was only partly written up.
  const since = log.through.includes("T") ? log.through : `${log.through}T23:59:59`;
  const out = execFileSync("git", ["log", `--since=${since}`, "--no-merges", "--date=short", "--pretty=%ad%x09%s"], {
    cwd: new URL(".", import.meta.url),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  commits = out.trim() ? out.trim().split("\n").map((line) => line.split("\t")) : [];
} catch {
  // No git, or no history: the hand-written changelog stands alone.
}

// Plain words for visitors: news.mjs, which the page uses too, for commits
// made after this build (see the page's "Just landed").
const WORLD_NAMES = Object.fromEntries(portals.worlds.map((w) => [w.id, w.label]));

const months = log.months.map((m) => ({ ...m, items: [...m.items] }));
// A month written by hand can say what it was about in a line, shown above
// its changes; one made only of commits has none.
for (const [date, subject] of commits.reverse()) {
  const entry = item(subject, WORLD_NAMES);
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

/** How many of a month's items show before its "Show all" (the page's
 *  script folds the rest; without it, everything shows). */
const MONTH_PREVIEW = 6;
const changes = months
  .map(({ month, summary, items }, index) => {
    const [y, m] = month.split("-").map(Number);
    const list = items
      .map((i, k) => `          <li data-tag="${esc(i.tag)}"${k >= MONTH_PREVIEW ? ' class="extra"' : ""}><span class="tag ${esc(i.tag)}">${esc(TAGS[i.tag] ?? i.tag)}</span><span>${esc(i.text)}</span></li>`)
      .join("\n");
    // "17 changes · 9 new · 2 worlds · 6 better", under the month's name.
    const kinds = Object.keys(TAGS)
      .map((tag) => [tag, items.filter((i) => i.tag === tag).length])
      .filter(([, n]) => n > 0)
      .map(([tag, n]) => `${n} ${tag === "world" ? (n === 1 ? "world" : "worlds") : TAGS[tag].toLowerCase()}`);
    const counts = [`${items.length} change${items.length === 1 ? "" : "s"}`, ...kinds].join(" · ");
    return `      <div class="month">
        <h3><time datetime="${esc(month)}">${MONTH_NAMES[m - 1]} ${y}</time>${index === 0 ? ' <span class="latest">Latest</span>' : ""}<small>${esc(counts)}</small></h3>
        <div>
${summary ? `          <p class="summary">${esc(summary)}</p>
` : ""}        <ul>
${list}
        </ul>
        </div>
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

// The page asks GitHub for anything committed after the newest commit here,
// so "What's new" keeps up between deploys.
let built = log.through.includes("T") ? log.through : `${log.through}T23:59:59+08:00`;
try {
  built = execFileSync("git", ["log", "-1", "--format=%cI"], { cwd: new URL(".", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || built;
} catch {
  // No git: from the hand-written part on.
}
copyFileSync(here("news.mjs"), here("public/news.mjs"));

// The gallery: pictures and clips from the README's own (docs/media),
// copied in at build so they live in one place in the repository.
const GALLERY = [
  { file: "hero.gif", wide: true, caption: "In the hall: waving, bowing, and dozing off in seiza", alt: "In Seiza's hall, avatars wave, bow on the tatami, kneel in seiza and doze, and clap and cheer." },
  { file: "campsite.jpg", caption: "The campsite at night", alt: "Night at the campsite: an avatar sits by a campfire under a starry sky, a tent to one side." },
  { file: "fantasy.gif", caption: "Fantasy mode: a katana against a necromancer", alt: "A fighter swings a katana and lets go a fire special while a necromancer casts a bolt and raises three small skeletons." },
  { file: "band.gif", caption: "Band mode: taiko, guitar, drums, keys, kulintang, and light sticks", alt: "A taiko player, a guitarist, a drummer at a kit, a keyboard player, and a kulintang player perform while two fans wave light sticks." },
  { file: "together-consent.gif", caption: "A hug, only after a yes", alt: "One avatar asks another for a hug; after Yes, they step close and hug." },
  { file: "classroom.jpg", caption: "The classroom", alt: "A classroom with students at desks, one raising a hand, the teacher at the board, and a screen." },
  { file: "garden.jpg", caption: "The garden and its pond", alt: "The garden at dusk: an avatar wades in the pond among koi and lily pads." },
  { file: "designer.jpg", caption: "The avatar designer", alt: "The avatar designer: a preview of a designed avatar beside controls for its look." },
];
mkdirSync(here("public/media"), { recursive: true });
for (const g of GALLERY) copyFileSync(new URL(`../docs/media/${g.file}`, import.meta.url), here(`public/media/${g.file}`));
const gallery = GALLERY.map(
  (g) => `      <figure class="shot${g.wide ? " wide" : ""}">
        <a href="media/${esc(g.file)}"><img src="media/${esc(g.file)}" alt="${esc(g.alt)}" loading="lazy" decoding="async"></a>
        <figcaption>${esc(g.caption)}</figcaption>
      </figure>`
).join("\n");

const template = readFileSync(here("index.html"), "utf8");
const page = template
  .replace("<!--JSONLD-->", `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`)
  .replace("<!--WORLDS-->", worldCards)
  .replace("<!--GALLERY-->", gallery)
  .replace("<!--CHANGES-->", changes)
  .replaceAll("<!--WORLD_COUNT-->", String(worlds.length))
  .replace("<!--LIVE_SINCE-->", esc(built))
  .replace("<!--WORLD_NAMES-->", esc(JSON.stringify(WORLD_NAMES)));
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
