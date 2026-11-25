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

You need the Cloudflare account the worlds are on, with `seiza.cc` added to
it, and Node and this repository on your computer (`npm install` done).

### 1. Make one token

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy what it prints. It's the one key to the counts: keep it somewhere safe
(a password manager), and never paste it into a page, a chat, or git.

### 2. Give it to every world you want counted

Each world is its own Worker, so each gets the secret. Paste the token when
asked:

```bash
npx wrangler secret put SEIZA_STATS_TOKEN                                   # Seiza itself
npx wrangler secret put SEIZA_STATS_TOKEN --config worlds/seiou/wrangler.jsonc
npx wrangler secret put SEIZA_STATS_TOKEN --config worlds/seinag/wrangler.jsonc
npx wrangler secret put SEIZA_STATS_TOKEN --config worlds/seisugbo/wrangler.jsonc
# …and the same for seizora, seizorai, seilaya, tulay, iscolab
```

Then redeploy each world (`npm run deploy` for Seiza, and
`npx wrangler deploy --config worlds/<world>/wrangler.jsonc` for the rest,
after their builds) so the room servers start counting. A world you leave
out simply shows as "not counting" on the dashboard.

### 3. Put admin.seiza.cc behind Cloudflare Access

In the Cloudflare dashboard:

1. Open **Zero Trust** (the first time, pick a team name and the free plan;
   no card is needed for it). Your team name is what Access lives at:
   `<team>.cloudflareaccess.com`.
2. Go to **Access → Applications → Add an application → Self-hosted**.
3. **Application domain:** `admin.seiza.cc`. Give it a name, such as
   "Seiza research".
4. Add a **policy**: action **Allow**, rule **Emails**, and list the
   addresses of everyone who may see the counts (yours, a co-researcher's).
   Leave the login method as the one-time PIN by email, or add Google.
5. Save. On the application's **Overview**, copy its **Audience (AUD)
   tag**.

### 4. Tell the dashboard who it trusts, and deploy it

In `admin/wrangler.jsonc`, fill in:

- `ACCESS_TEAM`: your team name (just the part before `.cloudflareaccess.com`).
- `ACCESS_AUD`: the AUD tag from step 3.
- `SEIZA_WORLDS`: already lists the nine worlds and their addresses; edit it
  if yours differ.

Then, from the repository's root:

```bash
cd admin
npx wrangler secret put SEIZA_STATS_TOKEN     # the same token as the worlds
npx wrangler deploy
```

The `routes` entry makes `admin.seiza.cc` its address and adds the DNS
record for it. Open `https://admin.seiza.cc`: Access asks you to sign in,
and then the dashboard loads. If it says 403 after signing in, the team
name or AUD tag doesn't match; if a world shows "not counting", its token
is missing or different.

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
