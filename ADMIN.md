# Admin and moderation

Seiza uses three separate secrets to control three separate things. Each one
answers a different question and carries a different risk if it leaks, so
they aren't combined into one password.

| Secret | Controls | Stored in | Who changes it, and how |
|---|---|---|---|
| `SEIZA_EDITOR_PASSWORD` | Editing the world | Worker secret | A deployer, with `wrangler secret put` or the Cloudflare dashboard. Not from inside the app. |
| `SEIZA_ADMIN_KEY` | Editing the world **and** moderating people | Worker secret | A deployer, with `wrangler secret put` or the Cloudflare dashboard. Not from inside the app. |
| Room entry password | Joining the room at all | The room's own Durable Object storage | Any signed-in admin, live, from the **Admin** button. No redeploy needed. |

If you only set one, set `SEIZA_ADMIN_KEY` and skip `SEIZA_EDITOR_PASSWORD`.
See [Do I need both?](#do-i-need-both-seiza_editor_password-and-seiza_admin_key)

> **Note:** Voice and video across networks (TURN) need two more Worker
> secrets, and both are required: `CLOUDFLARE_TURN_KEY_ID` and
> `CLOUDFLARE_TURN_KEY_API_TOKEN`, from **Realtime > TURN** in the Cloudflare
> dashboard. Setting only the API token does nothing. See
> [Voice and video across networks](DOCS.md#voice-and-video-across-networks),
> which also explains how to check that it works.

## Set a Worker secret

You can set any of the Worker secrets in two ways.

**From the command line:**

```bash
npx wrangler secret put SEIZA_ADMIN_KEY
```

**From the Cloudflare dashboard:**

1. Go to **Workers & Pages** and select your Worker.
2. Go to **Settings > Variables and Secrets** and select **Add**.
3. Choose the **Secret** type, enter the secret's name and value, and save.

## `SEIZA_EDITOR_PASSWORD`: editing only

One shared password. Anyone who has it can turn on Edit Mode and place, move,
or delete objects. It doesn't give access to the participant list or
moderation.

```bash
npx wrangler secret put SEIZA_EDITOR_PASSWORD
```

## `SEIZA_ADMIN_KEY`: editing and moderation

```bash
npx wrangler secret put SEIZA_ADMIN_KEY
```

When the admin key is set, it replaces `SEIZA_EDITOR_PASSWORD` for Edit
Mode. Selecting the pencil icon asks for the admin key instead of the editor
password, and the correct key grants editing plus everything in the list
below.

If you set both, the editor password still works as a Worker secret, but the
app only ever asks for the admin key, so there's no way to enter the editor
password in the interface. Set one or the other, unless another integration
needs the editor password.

### What an admin can do

After signing in, an admin can:

- **See the participant list.** Select the world-name pill at the top left.
  Everyone can see the list; only the action buttons on each row are for
  admins.
- **Mute or unmute someone's microphone.** Mute is enforced: the person's
  browser is told to turn off their microphone. Unmute is a request that the
  person's browser carries out, because voice is peer-to-peer and the server
  never has access to anyone's audio.
- **Remove someone.** This disconnects them immediately, with a message
  saying an admin removed them. It isn't a ban: they can rejoin with the same
  link right away. To keep someone out, set a
  [room entry password](#room-entry-password-who-can-join) and change it.
- **Teleport to someone.** This moves your own avatar to theirs. Nobody else
  moves.
- **Gather everyone.** This moves everyone else's avatar to your position.
  Each person's browser moves its own avatar in response to a server
  message, because every player is the only authority over their own
  position.

### Why do I have to enter the admin key again after reloading?

This is intentional. Admin status exists only in that connection's memory on
the server (`attachment.isAdmin` in `worker/room.ts`) and in the page's
state. It's never saved in `localStorage`, `sessionStorage`, or any other
browser storage. Closing the tab or reloading means signing in again.

Saving the key in the browser would create two risks:

- **Shared devices.** Anyone who later opened Seiza in the same browser
  profile, such as a shared classroom computer or a borrowed laptop, would
  become an admin without being asked. Unlike a login system, there'd be no
  visible "signed in as admin" step to notice and undo.
- **Script injection.** Seiza displays text from users (chat, notes, and
  boards) and loads URLs that users provide. If a bug ever let one of those
  inject a script, a stored key is the first thing that script would look
  for. With nothing stored, there's nothing to steal.

Entering the key each session is slightly less convenient, and much harder to
leak.

### Why can't I change the admin key from inside the app?

You can change it without a full redeploy: running
`wrangler secret put SEIZA_ADMIN_KEY` again updates the live Worker. The app
intentionally has no form for it, for three reasons:

- **It would need its own protection.** Changing the key would have to be
  protected by something, usually the key itself. That makes an in-app form
  least useful in the case that matters most: a forgotten or leaked key.
- **More screens mean more exposure.** A form would show the key in the
  browser more often (on screen, to autofill, during screen sharing, and to
  people nearby) than the one time you type it to sign in.
- **You rarely change it.** Unlike the room entry password, you usually set
  the admin key once per deployment. A little command-line effort is worth
  the smaller attack surface.

### Do I need both `SEIZA_EDITOR_PASSWORD` and `SEIZA_ADMIN_KEY`?

No. For almost every deployment, set only `SEIZA_ADMIN_KEY`. It does
everything the editor password does, plus moderation.

The editor password alone is for one narrower case: you want some people to
edit the world without being able to remove or mute anyone, and you're fine
with a second shared password instead of per-user roles (which Seiza
doesn't have).

## Room entry password: who can join

The room entry password is the only secret an admin can change from inside
the app:

1. Sign in as an admin.
2. Select the **Admin** button, next to **Avatar** at the top right.
3. Enter a password in the **Room entry password** field and apply it.

From then on, anyone joining sees a password prompt instead of the world.
To remove the requirement, clear the field and apply it again.

The room entry password is stored in the room's own Durable Object
(`worker/room.ts`), not as a Worker secret. It's handled differently from the
admin key on purpose:

- **The risk is lower.** A leaked admin key lets someone edit the world,
  remove people, mute people, and move people. A leaked room password lets
  an uninvited guest in, the same as forwarding the link. Lower risk
  justifies an easier way to change it.
- **It changes more often.** You set the admin key once per deployment. A
  teacher might change the room password for every class, or an organizer
  for every event. Needing a redeploy or a command for a weekly change would
  be a burden.

If your threat model calls for a fixed, redeploy-only room password, you can
change that in your fork. Add the password to `wrangler.jsonc` as a secret,
the same way as the other two, and check it in `worker/index.ts` instead of
in `worker/room.ts`'s storage. You give up changing it at runtime, and gain
the admin key's lower exposure.

## What Seiza doesn't provide

- **Per-user accounts.**
- **Roles beyond "admin" and "everyone else."** An admin can moderate other
  admins; there's no hierarchy.
- **A ban list.** Removing someone doesn't stop them from rejoining. Only a
  room password, changed afterward, does.

If your deployment needs these, you can build them on top of the three
secrets above.
