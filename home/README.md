# home.seiza.cc

Seiza's homepage: what Seiza is, the worlds, what's new, and how to host
your own. It's a static page in `public/`, served by an assets-only Worker
with no code of its own.

## How it stays current

`build.mjs` writes two files the page reads (both git-ignored):

- `public/worlds.json`: Seiza and every world its portals go to, from
  `public/worlds/default/world.json`. Add a portal, and the world shows up
  here on the next deploy.
- `public/changelog.json`: "What's new". The months before it was automatic
  are in `changelog.json`, written by hand. Every commit since its
  `through` date is added on its own, reworded for visitors: only features
  and fixes, the world named instead of the code's scope, the first point
  of the message only, and a few technical words swapped for everyday ones
  (see `item()` in `build.mjs`). Plain commit messages make a plain
  changelog.

To rewrite a month by hand, add it to `changelog.json` and move `through`
past it.

On the page, each month is headed by its counts (changes, new, worlds,
better). It shows its first six changes with a "Show all", the two latest
months show and the rest fold behind a button, and chips filter by kind.
All of it is the page's script working on what the build wrote into the
HTML, so without JavaScript, and for search engines, every change shows.

## Deploy

```bash
node home/build.mjs
npx wrangler deploy --config home/wrangler.jsonc
```

This also attaches the `home.seiza.cc` custom domain, if `seiza.cc` is on
the same Cloudflare account. Otherwise, remove `routes` from
`wrangler.jsonc` and add the domain in the dashboard under **Settings >
Domains & Routes**.

### Deploy from git (Workers Builds)

Create a Worker from the repository in the Cloudflare dashboard
(**Workers & Pages > Create > Import a repository**), then under
**Settings > Build**:

- **Root directory:** `home`
- **Build command:** `node build.mjs`
- **Deploy command:** `npx wrangler deploy`
- **Non-production branch deploy command** (if shown):
  `npx wrangler versions upload`

"What's new" needs the commit history. If a deploy from git shows only the
hand-written months, the build cloned only the latest commit: deploy from
your machine instead.

Preview it locally: `node home/build.mjs`, then any static server, for
example `npx serve home/public`.
