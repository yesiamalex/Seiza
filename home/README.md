# home.seiza.cc

Seiza's homepage: what Seiza is, the worlds, what's new, and how to host
your own. It's a static page in `public/`, served by an assets-only Worker
with no code of its own.

## Update "What's new"

The changelog is `public/changelog.json`. It's written by hand, in plain
words for visitors, because commit messages are written for contributors.
To see what happened since the newest month in it:

```bash
node home/changelog-draft.mjs
```

Then add the month's items, newest month first. Tag each item `new`,
`world`, or `better`.

## Deploy

```bash
npx wrangler deploy --config home/wrangler.jsonc
```

This also attaches the `home.seiza.cc` custom domain, if `seiza.cc` is on
the same Cloudflare account. Otherwise, remove `routes` from
`wrangler.jsonc` and add the domain in the dashboard under **Settings >
Domains & Routes**.

Preview it locally with any static server, for example
`npx serve home/public`.
