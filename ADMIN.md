# Admin & moderation

Seiza has three separate secrets that gate three separate things. They're
kept deliberately separate rather than folded into one "password" concept,
because they answer three different questions and carry three different
levels of risk if one leaks:

| Secret | Answers | Where it lives | Who can change it, and how |
|---|---|---|---|
| `SEIZA_EDITOR_PASSWORD` | Can this connection edit the world? | Worker secret | A deployer, via `wrangler secret put` — never from inside the app |
| `SEIZA_ADMIN_KEY` | Can this connection edit the world **and** moderate people? | Worker secret | Same — a deployer, via `wrangler secret put` |
| Room entry password | Can this connection join the room **at all**? | This room's own Durable Object storage | Any signed-in admin, live, from the Admin button — no redeploy |

If you only set one thing, set `SEIZA_ADMIN_KEY` and skip
`SEIZA_EDITOR_PASSWORD` entirely — see "Do I need both?" below.

> **Voice/video across networks (TURN) uses two more Worker secrets, and
> needs both:** `CLOUDFLARE_TURN_KEY_ID` *and* `CLOUDFLARE_TURN_KEY_API_TOKEN`,
> from **Realtime → TURN** in the Cloudflare dashboard. Setting only the API
> token does nothing. See "Voice/video across different networks" in [DOCS.md](DOCS.md),
> which also shows how to check it's working.

## `SEIZA_EDITOR_PASSWORD`: gates editing only

Unchanged from before this document existed. One shared password; anyone
who has it can enable Edit Mode and place, move, or delete objects. No
roster, no moderation. Set it with:

```bash
npx wrangler secret put SEIZA_EDITOR_PASSWORD
```

## `SEIZA_ADMIN_KEY`: gates editing *and* moderation

```bash
npx wrangler secret put SEIZA_ADMIN_KEY
```

**OR EDIT THE SECRETS VARIABLES with these values in your Cloudflare deployment dashboard UI!**

When this is set, it **supersedes** `SEIZA_EDITOR_PASSWORD` for the Edit
Mode gate specifically — clicking the pencil icon now asks for the admin
key, not the editor password, and entering it correctly grants both
editing and everything below. If you set both, the editor password still
technically works as a Worker secret, but the client's UI only ever
prompts for the admin key once one exists, so in practice the editor
password becomes unreachable from the interface. Set one or the other,
not both, unless you have a specific reason to keep the editor password
alive for some other integration.

An admin, once signed in, can:

- **See the participant roster.** Click the world-name pill, top left —
  this is visible to *everyone*, admin or not; only the action buttons on
  each row are admin-only.
- **Mute or unmute someone's mic.** "Mute" is enforceable — the target's
  own client is told to disable its microphone track. "Unmute" is really
  a *request* the target's client fulfills, not something forced on
  them, because voice is peer-to-peer (see the project paper, Section
  5.7) and the server never has access to anyone's actual audio to turn
  on remotely.
- **Kick someone.** Disconnects them immediately, with a message
  explaining an admin removed them (not a generic connection error).
  This is a one-time disconnect, not a ban — nothing stops them
  rejoining with the same link a moment later. If you need to actually
  keep someone out, use the room entry password below and change it.
- **Teleport to someone.** Moves *your own* avatar to theirs. No one
  else's position is touched.
- **Gather everyone here.** The reverse — moves *everyone else's* avatar
  to your current position. Each client teleports itself in response to
  a server message; nothing here reaches into another client's state
  directly, consistent with every player always being the sole authority
  over their own position over the wire.

### Why isn't the admin key remembered after I reload the page?

On purpose. Admin status lives only in that WebSocket connection's
server-side memory (`attachment.isAdmin` in `worker/room.ts`) and the
matching client-side React state — nowhere in `localStorage`,
`sessionStorage`, or any other browser storage. A closed tab or a reload
means signing in again.

This was a specific choice, not an oversight. Persisting the raw admin
key in browser storage would mean:

- **Shared or borrowed devices become a standing risk.** Anyone who
  later opens Seiza in that same browser profile — a shared classroom
  computer, a borrowed laptop — would silently inherit admin rights with
  no prompt at all, unlike a login system there'd be no visible "signed
  in as admin" step to notice and undo.
- **Any future stored-XSS bug becomes worse than it has to be.** This
  app already renders user-supplied text (chat, notes, board text) and
  loads user-supplied asset URLs. If a bug ever let one of those inject
  a script, a key sitting in `localStorage` is exactly what that script
  would go looking for first. Keeping the key out of any browser storage
  means there's nothing there to steal even if that happens.

Re-entering it each session is the tradeoff this makes deliberately in
exchange for that: mildly less convenient, meaningfully harder to leak.

### Why can't I change the admin key from inside the app?

You can rotate it without a full redeploy — `wrangler secret put
SEIZA_ADMIN_KEY` again updates a live Worker in place — but there's
deliberately no "change admin key" form inside the app itself. A few
reasons stacked together:

- **Bootstrapping problem.** Whoever's allowed to change the key would
  itself need to be gated by *something* — normally the key itself,
  which makes "forgot/leaked the key, need to rotate it" exactly the
  case where an in-app flow is least useful.
- **More UI surface is more exposure.** A "change admin key" screen adds
  a place the key transits through the browser (visible on screen,
  subject to autofill, screen-sharing, shoulder-surfing) beyond the one
  unavoidable moment of typing it to sign in.
- **It's genuinely low-frequency.** Unlike a room entry password (see
  below), the admin key is realistically set once per deployment and
  rarely touched again, so paying a small amount of CLI friction for a
  meaningfully smaller attack surface is a good trade here specifically.

### Do I need both `SEIZA_EDITOR_PASSWORD` and `SEIZA_ADMIN_KEY`?

No. For almost every deployment, set `SEIZA_ADMIN_KEY` alone and skip the
editor password entirely — it does everything the editor password does,
plus moderation. The editor password on its own still exists for a
narrower case: you want *some* people to edit the world without also
being able to kick or mute anyone, and you're comfortable that being a
second password rather than a per-user role (there still isn't one).

## Room entry password: gates who can join

This is the odd one out on purpose, and it's the one thing an admin *can*
change live from inside the app: the Admin button (next to Avatar, top
right) has a "Room entry password" field once you're signed in. Setting
it means anyone trying to join needs that password too, checked before
they can join it at all — you get a password prompt instead of the world;
clearing the field and applying removes the requirement again.

This is a **third, separate secret** from the admin key, stored in this
room's own Durable Object (`worker/room.ts`), not a Worker secret at all
— and that's a deliberate asymmetry with the admin key above, not an
inconsistency:

- **The stakes are different.** If an admin key leaks, someone can edit
  the world and moderate — kick people, mute people, move people. If a
  *room password* leaks, the worst case is an uninvited guest gets in,
  same as anyone forwarding a normal link. Lower stakes justify a lower
  ceremony for changing it.
- **It's likely to change far more often.** An admin key is set once per
  deployment. A room password is much more plausibly something an
  instructor rotates per class, or an event organizer sets fresh per
  event ("this week's code is..."). Requiring a redeploy or a CLI command
  for something you might change weekly would be genuinely annoying in a
  way it isn't for the admin key.

If you'd rather this also be a fixed, redeploy-only secret for your own
threat model, that's a reasonable call for your fork — the pattern to
follow would be adding it to `wrangler.jsonc`'s secrets the same way as
the other two and checking it in `worker/index.ts` instead of
`worker/room.ts`'s mutable storage, trading the runtime flexibility above
for the same lower-exposure profile the admin key has.

## What none of this is

Not per-user accounts. Not roles beyond "admin" and "everyone else" (an
admin can moderate other admins; there's no hierarchy). Not a ban list —
kicking someone doesn't stop them rejoining, only a room password
(changed afterward) does that. If your deployment needs any of those,
they're reasonable extensions to build on top of the three secrets
above, not something this version tries to be.
