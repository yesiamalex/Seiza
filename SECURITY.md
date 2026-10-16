# Security

This page describes what Seiza protects against, what a deployer should
set up, and what it doesn't protect against. It reflects an audit of the
room server, the Worker, and the client in October 2026.

## Threat model

Seiza is built for classrooms, meetings, and small public rooms. The people
it defends against are:

- **A visitor** who joins a room and sends whatever they like over the
  WebSocket, not just what the app would send.
- **Anyone on the internet** who calls the Worker's upload and TURN
  endpoints directly, without the app.
- **Another website** that tries to use a visitor's browser against Seiza
  (framing it, or calling its endpoints).

It does not try to defend against someone who holds the editor password or
admin key, or against Cloudflare itself.

## What's protected

### Everything a visitor sends

The room server (`worker/room.ts`) treats every message as untrusted:

- **Shape and size.** Messages over 64 KB are dropped unread. Every field is
  checked: positions must be finite and in bounds, names and gestures must
  match a pattern, colours must be hex, and so on.
- **Rate limits per connection** for chat, gestures, avatar changes, lights,
  board text, presenting, media, body tracking, object edits (10 a second,
  bursts of 40), and voice signalling.
- **One join per connection.** A second join is ignored, so it can't reset
  the connection's password-guess counters.
- **Connection cap.** A room accepts its occupant limit plus 8 sockets,
  joined or not.

### Passwords

The room password, editor password, and admin key are compared in constant
time. Each connection gets 5 guesses at each one, and a connection that
uses up its room password guesses is closed. Across all connections, one
IP address gets 30 failed guesses per 15 minutes before every guess is
refused. The editor password and admin key are kept in memory only, never
in browser storage.

### Text

Chat, display names, and board text have control characters and Unicode
direction overrides removed, so text can't break the layout, hide part of
itself, or display in a different order from what was typed (a common way
to fake a link or a name). Everything is shown as plain text, never as
HTML, and chat has no commands, so there's nothing to inject.

### URLs other people's browsers will load

Avatars, placed models, images, videos, environments, and skyboxes are all
loaded by everyone in the room, so their URLs are checked on the server:

- Only this deployment's own paths, designer avatars, or `https://`
  addresses. No `javascript:`, `data:`, `file:`, `//host`, `/\host` (which
  browsers read as `//host`), or `user:password@` addresses.
- Nothing on a local network: `localhost`, `.local` and similar names,
  and private, loopback, link-local, and reserved IP addresses. A pasted
  link can't make everyone's browser contact their own router or intranet.
- **Avatars can't be outside URLs at all**, unless the deployment lists the
  origin in `SEIZA_AVATAR_ORIGINS`. Any visitor can set an avatar, and an
  avatar on a server they control would let them log the IP address of
  everyone in the room. A refused avatar becomes the default one.

### Uploads

`POST /api/avatars` and `POST /api/assets` (`worker/index.ts`,
`worker/uploadChecks.ts`) check the file's bytes, not its name:

- Size limits: 24 MB for avatars and models, 3 MB for images.
- The real file header (glTF, PNG, JPEG, WebP, or GIF).
- **Inside every model and avatar:** nothing loaded from another address,
  and size limits an avatar must stay under: 300,000 vertices, 500,000
  triangles, 512 mesh parts, and no texture over 4096 pixels on a side (for
  a model: 2 million, 3 million, 4,096, and 8192). Real avatars are far
  below them: VRoid's samples, a detailed hand-made VRM, and an Avaturn
  export all have 18,000 to 31,000 vertices and up to 40,000 triangles.
  These are read from the file's description and image headers, so a
  small file that unpacks into a huge picture or mesh, which could freeze
  everyone's tab, is caught without decoding anything. The check takes
  about a millisecond for a 21 MB avatar.
- Images over 4096 pixels on a side are refused.
- Stored under random names, and served with their fixed type plus
  `nosniff` and a sandboxing policy, so even a file opened directly in a
  tab can't run anything.
- Avatar uploads are open to anyone, rate-limited per IP, and expire after
  30 days. Asset uploads need the editor password when one is set.

Checks in the browser (the Avaturn converter, `validateVrm.ts`) are only for
the uploader's convenience. Anyone can skip them, which is why the server
checks again.

### Voice and video

Media goes directly between browsers. The room server only relays the
signalling, and only from a joined player to another joined player, at most
60 a second and 32 KB each. Each browser checks the shape of every signal
it receives and caps how many it queues per peer. The TURN API token never
leaves the Worker, and credentials are minted only for this site's own
pages, last two hours, and are rate-limited per IP.

### The site itself

`public/_headers` sends, with every page and file:

- **Content-Security-Policy:** scripts only from this site, no `eval`, no
  plugins, nothing framed inside the app, and the app can't be framed by
  another site (clickjacking). Images, video, and models may come from any
  `https://` address, because placing them by URL is an editor feature.
- `X-Frame-Options`, `X-Content-Type-Options: nosniff`, a strict
  `Referrer-Policy`, `Cross-Origin-Opener-Policy`, and a
  `Permissions-Policy` that allows the camera, microphone, screen sharing,
  and VR for this site only, and turns off location, payments, USB, and
  similar.

To let a learning platform embed Seiza in an iframe, add its address to
`frame-ancestors` in `public/_headers` and remove `X-Frame-Options`.

## Deployer checklist

1. **Set an editor password** (`wrangler secret put SEIZA_EDITOR_PASSWORD`)
   for any room that isn't fully trusted. Without one, anyone can place,
   move, and delete objects and paste model or video URLs.
2. **Set an admin key** (`SEIZA_ADMIN_KEY`) if you need to kick, mute, or
   set a room password.
3. **Keep secrets as secrets.** The TURN key ID and API token, the editor
   password, and the admin key all go in as Worker secrets (Settings >
   Variables and Secrets > Secret), never in `wrangler.jsonc` or the repo.
4. **Add a Cloudflare rate-limiting rule** on `POST /api/avatars` and
   `/api/turn-credentials` if the site is public. The built-in limits are
   per Worker instance, so they stop a loop, not a distributed attack.
5. **List outside avatar hosts** in `SEIZA_AVATAR_ORIGINS` only if your
   `world.json` presets use absolute URLs.

## What it doesn't protect against

- **IP addresses between peers.** Voice and video are peer to peer, so the
  people you connect to can see your IP address, as with any WebRTC call.
  Forcing everything through TURN would hide it, at the cost of relay
  bandwidth; it isn't an option yet.
- **Kicked people can come back.** A kick closes the connection but isn't a
  ban. To keep someone out, an admin can set a room password.
- **Editors are trusted.** Someone with edit access can paste any public
  `https://` model, image, or video URL, which everyone's browser then
  loads. The URL rules above still apply, and pasted models aren't size
  checked the way uploads are.
- **Rate limits and guess limits live in memory**, so they reset when the
  room or the Worker restarts.
- **No accounts.** The passwords are shared secrets, not per-person logins.

## Reporting a problem

Please report security issues privately to the maintainer rather than in a
public issue.
