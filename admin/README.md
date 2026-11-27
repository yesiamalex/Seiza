# admin.seiza.cc

Seiza's research dashboard: across every world, how many people come and
when, how they communicate (mic, camera, screens, chat, together gestures),
what they do (sit, gesture, write on boards, present, the room modes, a
world's own exhibits such as Seisugbo's artworks), where in each world they
spend their time, and what they were doing there (talking, sitting, near
someone, passing through), which is as near as counts can honestly get to
why a place is used.

**What is and isn't collected.** Counts only. Each world's room server
(`worker/stats.ts`) keeps one small summary a day, 30 days of them, then
drops the oldest. No names, accounts, IP addresses, recordings, chat text,
or anyone's path through a world; a day being counted holds short random
per-visit tokens only so each visitor counts once, and a finished day keeps
the counts alone. Visitors see a notice, once a visit, that the world keeps
anonymous counts. A world counts nothing until you give it a token (below).

**How it's built.** Each world answers `GET /api/stats` with its days, but
only to a request carrying its `SEIZA_STATS_TOKEN`; without it the address
says "Not found". This dashboard is a small Worker of its own
(`worker.mjs`) that serves one page (`public/index.html`) and, at
`/api/summary`, asks each world in turn. It stores nothing.

**How it's protected.** Two locks, both required:

1. **Cloudflare Access** in front of `admin.seiza.cc`: nobody reaches the
   Worker without signing in as someone you've allowed (by email, with a
   one-time code, or through Google). Free for up to 50 people.
2. **The Worker checks Access's signed login itself** on every request
   (its signature against your Access team's public keys, the audience,
   the issuer, and the expiry), so even a request that slipped past Access
   gets a 403.

The token that opens each world's counts lives only in Workers' secret
storage, never in the page or the browser.

## Deploy it

It answers at two addresses: **admin.seiza.cc**, and
**admin.figueroaziedell.workers.dev** as a fallback (the Worker is named
`admin`, so its workers.dev address is `admin.<your subdomain>.workers.dev`).
Both go behind Cloudflare Access. The fallback is safe even before you do:
without Access's signed login, the Worker answers 403 to everyone.

Everything below can be done in the Cloudflare dashboard and on github.com.

### 1. Make one token

Use a password manager's generator for a random password of 32 characters
or more, or a passcode of your own of at least 12 characters that nobody
would guess (the worlds ignore anything shorter). Or, with Node:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

It's the one key to the counts: keep it in a password manager, never in a
page, a chat, or git.

### 2. Give it to every world you want counted

In **Workers & Pages**, open each world's Worker, then **Settings →
Variables and Secrets → Add**: type **Secret**, name `SEIZA_STATS_TOKEN`,
the token as its value, and **Deploy**. The new version starts counting at
once. (From the command line instead: `npx wrangler secret put
SEIZA_STATS_TOKEN`, with `--config worlds/<world>/wrangler.jsonc` for each
world but Seiza itself.) A world you leave out shows as "not counting".

### 3. Put both addresses behind Cloudflare Access

Open **Zero Trust** (the first time, pick a team name and the free plan).
Your team name is the part before `.cloudflareaccess.com`, shown under
**Settings → Custom Pages**.

For **admin.seiza.cc**: **Access → Applications → Add an application →
Self-hosted**. Domain `admin.seiza.cc`; a policy with action **Allow**,
rule **Emails**, and the addresses allowed to see the counts. Save, and copy
the application's **Audience (AUD) tag** from its Overview.

For **the workers.dev fallback**: after step 5 has created the Worker, open
it, then **Settings → Domains & Routes**, and on the **workers.dev** row
choose **Enable Cloudflare Access**. That makes a second Access application
for `admin.figueroaziedell.workers.dev`; open it under **Access →
Applications**, give it the same Allow policy (your emails), and copy its
AUD tag too.

### 4. Tell the dashboard who it trusts

On github.com, open `admin/wrangler.jsonc`, click the pencil, and fill in:

- `ACCESS_TEAM`: your team name.
- `ACCESS_AUD`: both AUD tags, comma-separated:
  `"<admin.seiza.cc's tag>,<the workers.dev one's tag>"`. (Until you've
  made the second, put just the first.)

Commit. Neither value is a secret.

### 5. Create the admin Worker from the repository

**Workers & Pages → Create → Import a repository**, pick this repository,
and set **Root directory** `admin`, **Build command** empty, **Deploy
command** `npx wrangler deploy`. Deploy. It redeploys itself on every push
from then on. Then open the new `admin` Worker, **Settings → Variables and
Secrets**, and add the same `SEIZA_STATS_TOKEN` as a secret.

(From the command line instead: `cd admin`, `npx wrangler secret put
SEIZA_STATS_TOKEN`, `npx wrangler deploy`.)

The config claims `admin.seiza.cc` as a custom domain (it needs
`seiza.cc` on the same Cloudflare account) and turns on the workers.dev
address. If `admin.seiza.cc` doesn't show under **Settings → Domains &
Routes**, add it there as a **Custom domain**; if `seiza.cc` isn't on this
account at all, delete the `routes` line in `admin/wrangler.jsonc` and
use the workers.dev address alone.

### 6. Open it

`https://admin.seiza.cc`, or `https://admin.figueroaziedell.workers.dev`.
Access asks you to sign in, then the dashboard loads.

- **403 after signing in:** `ACCESS_TEAM` is wrong, or that address's AUD
  tag isn't in `ACCESS_AUD` (each address has its own).
- **403 without being asked to sign in (the workers.dev address):** Access
  isn't on for it yet: step 3's second half.
- **A world's card says what's wrong with it**, in so many words:
  - *"running an older version":* that world hasn't been redeployed since
    this check was added. Redeploy it (in its Worker: **Deployments**, or
    push to main if it builds from Git).
  - *"Counting is off there":* that world has no `SEIZA_STATS_TOKEN` secret,
    or it's under 12 characters. The name must be exactly
    `SEIZA_STATS_TOKEN`; the value is your passcode.
  - *"isn't the same as this page's":* the two values differ. Paste the
    same one into both again. (Spaces or a line break at either end don't
    count: they're trimmed.)
  - *"no SEIZA_STATS_TOKEN secret" on every card:* it's the admin Worker
    that's missing it.
- The token's value is never written in this repo, in a world's
  `world.json` or anywhere else: only in each Worker's secrets. The name
  `SEIZA_STATS_TOKEN` is in the code; that's just how it's looked up.

## Changing a token

Run step 2 and step 4's `secret put` again with a new one, then redeploy.
The old token stops working at once.

## For research

The CSV download has one row per world per day, every count in its own
column, for a spreadsheet or R. Things to keep in mind when reading it:

- A "visitor" is one visit to a page; a reload is another. Over several
  days, visitors add up each day's.
- "Talking" is time with a mic on and not muted, not proof of speech.
- "Together" is time within 3 m of someone else, a proxemic distance (the
  edge of social space), not a conversation.
- Times are sampled every 10 s from movement the room already receives; a
  room where no one moves for a while counts that time at its next sample,
  up to a minute.
- If your study needs consent forms or ethics approval, the notice visitors
  see is a disclosure, not consent: arrange that as your institution asks.
