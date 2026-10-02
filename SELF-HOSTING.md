# Running Seiza somewhere other than Cloudflare

This guide is for a school, org, or individual that wants to run Seiza on
infrastructure they already have — a university VM, a VPS, a NAS, a box in a
server room — instead of on Cloudflare Workers.

**Read this first, because it will save you time:** Seiza was built *for*
Cloudflare, and porting it is a real engineering task, not a configuration
change. The deploy path in [DOCS.md](DOCS.md) is one command. This one is a fork.
§1 tells you honestly whether you should do it at all.

---

## 1. Should you actually do this?

The usual reasons people ask are covered better by the standard deployment
than by a port:

| Concern | Does porting help? |
| --- | --- |
| "We don't want a vendor holding our data." | **No.** The standard deploy already puts every room, asset, and avatar in *your own* Cloudflare account. Nobody running the Seiza project can see or touch it. That is the whole design. |
| "We can't afford it." | **No.** A classroom-sized deployment fits inside Cloudflare's free tiers. Self-hosting costs you a machine and the hours to maintain it. |
| "We want to modify it." | **No.** It's AGPL-3.0-or-later. Fork and modify it on Cloudflare. |
| "Our institution forbids third-party cloud services, or requires data to stay in-country / on-premises." | **Yes.** This is the real reason. |
| "We're air-gapped, or behind a firewall with no egress." | **Yes**, with caveats — see §6. |
| "We want to learn how it works." | Sure. Enjoy. |

If you are in one of the "yes" rows, read on. Otherwise [DOCS.md](DOCS.md) will
get you running in an afternoon and this will take considerably longer.

---

## 2. What you're replacing

Seiza's server side is small — two files — but it leans on three Cloudflare
primitives, and each needs a substitute.

| Cloudflare piece | What it does for Seiza | What it maps to |
| --- | --- | --- |
| **Worker** (`worker/index.ts`) | Serves the built client, handles asset/avatar upload and download, mints TURN credentials | Any HTTP server — Node, Deno, Bun, Go, nginx + a small app |
| **Durable Object** (`worker/room.ts`) | One authoritative, stateful instance per room; holds player state, placed objects, room password; relays WebRTC signaling | A WebSocket server with one in-memory room object per room id, plus somewhere to persist per-room state |
| **Workers KV** | Stores uploaded avatars (`.vrm`), models, and images | The filesystem, S3/MinIO, or any blob store |

Two things you do **not** have to replace, and should not try to:

- **The client.** `src/` is a plain Vite + React app. It builds to static files
  and does not know or care what is serving it.
- **Voice, camera, and screen media.** These are peer-to-peer WebRTC between
  browsers. Your server only relays a few signaling messages. This is why
  Seiza stays cheap to host: the expensive traffic never reaches you.

The Durable Object is the only genuinely interesting part of the port, and the
reason is worth understanding before you start: a Durable Object gives you
**exactly one instance per room id, globally, with no coordination on your
part**. Two people opening the same room always reach the same object. If you
deploy your replacement as a single process, you get that property for free.
If you run more than one process behind a load balancer, you do not, and two
people in "the same" room can land on different servers and never see each
other. See §5.

---

## 3. The realistic options

### Option A — Keep Cloudflare, but only as a thin shell (easiest)

Not everything has to move at once. The client is static files; serve those
yourself from your own domain and keep the Worker only for the room server.
Set `VITE_SEIZA_ROOM_HOST` to point at it. Your institution's users hit your
hostname; room state still lives at Cloudflare.

Whether that satisfies your policy is a question for your policy, not for this
document — but it is worth asking before doing the full port, because it is an
afternoon rather than a project.

### Option B — Node port of the Worker (most common real answer)

Reimplement `worker/index.ts` and `worker/room.ts` against Node. The protocol
is fully specified in `src/multiplayer/types.ts`, which both sides import, so
"is my server correct" has an actual answer: it satisfies that file's types.

Rough shape, with `ws` and `express` (or Fastify — nothing depends on the
choice):

```js
// One room object per room id. This Map *is* your Durable Object namespace.
const rooms = new Map();

function getRoom(id) {
  if (!rooms.has(id)) {
    rooms.set(id, {
      objects: new Map(),       // placed world objects
      environmentUrl: null,
      skyboxUrl: null,
      roomPassword: null,
      sockets: new Set(),       // each with its own attachment {connId, player, isEditor, isAdmin}
    });
  }
  return rooms.get(id);
}

wss.on("connection", (ws, req) => {
  const roomId = new URL(req.url, "http://x").pathname.split("/")[2];
  const room = getRoom(roomId);
  const attachment = { connId: crypto.randomUUID(), player: null };
  room.sockets.add(ws);

  ws.on("message", (raw) => handleMessage(room, ws, attachment, JSON.parse(raw)));
  ws.on("close", () => { /* remove, broadcast playerLeft */ });
});
```

Then port the `switch (message.type)` block from `worker/room.ts` almost
verbatim. **Port the validation and rate limits with it** — they are not
Cloudflare-specific and they are the only thing standing between your room and
one bad client. Specifically, keep: the per-action minimum intervals, the
object cap, `sanitizeAssetUrl`, `sanitizeDisplayName`, `sanitizeText`, the
bounds checks on positions, the headPitch clamp, and the auth attempt counters.

Differences from the Durable Object version you must handle yourself:

- **Hibernation doesn't exist.** `serializeAttachment`/`deserializeAttachment`
  become a plain object you keep alongside the socket, which is simpler. Drop
  the hibernation machinery entirely.
- **Persistence is yours.** `ctx.storage` is gone. Placed objects, the
  environment/skybox overrides, and the room password need somewhere to live
  or they vanish on restart. SQLite is more than enough; a JSON file per room
  is enough for a classroom.
- **Empty rooms are yours to clean up.** A Durable Object evicts itself. Your
  `Map` does not — delete a room when its last socket closes, or you leak.

### Option C — Docker Compose, everything in-house

For an air-gapped or fully on-prem deployment: Option B's server, plus nginx
in front for TLS and static files, plus MinIO or a mounted volume for uploads,
plus **coturn** for TURN (§6). This is the heaviest option and the only one
that removes every external dependency.

---

## 4. Uploads

`worker/index.ts` stores uploads in Workers KV under content-addressed keys and
serves them back. The important behaviours to preserve are not about KV:

- **Enforce size limits server-side.** The client checks too, but the client is
  not a security boundary. The current ceilings are 24 MB for avatars and
  models, 3 MB for images. Anything is fine; just enforce *something*.
- **Keep the same URL shapes** — `/api/avatars/<id>.vrm`,
  `/api/assets/<id>.<ext>` — or the client will not find them.
- **Serve correct `Content-Type` headers.** A `.vrm` served as `text/html` will
  fail to parse with a confusing error.
- **Set CORS if uploads live on a different origin** from the page.
- **Avatars have a 30-day TTL on KV.** Nothing depends on expiry; if your store
  keeps them forever, that is a storage-growth question, not a correctness one.

The filesystem is a perfectly good backing store for a single-server
deployment. Use a content hash as the filename and you keep the same
deduplication KV was giving you.

---

## 5. The scaling trap

This is the mistake that will cost you the most time, so it gets its own
section.

**Do not put two instances of the room server behind a round-robin load
balancer.** Room state lives in memory in the process that owns the room. Two
instances means two people who joined "the same" room can be in two different
rooms, each seeing an empty space, with nothing in the logs to say so.

Your options, in order of how much work they are:

1. **One process.** Genuinely fine for a school. Node handles hundreds of
   WebSocket connections without effort, and Seiza's per-room traffic is small
   because media never touches the server. Start here.
2. **Sticky routing by room id.** Hash the room id in your proxy and route all
   traffic for a room to the same backend. This is what a Durable Object does
   for you; here you do it in nginx or HAProxy.
3. **Shared state (Redis pub/sub, or similar).** Only if you actually need
   horizontal scale, which for instructional use you almost certainly do not.

The honest capacity limit is not the server anyway. It is the WebRTC mesh:
every participant connects to every other, so cost grows with the square of
the room size. Around 12 people with voice is where that starts to hurt, and
no amount of server-side scaling changes it — that would need an SFU.

---

## 6. TURN without Cloudflare

Read "Voice/video across different networks" in [DOCS.md](DOCS.md) first for *why*
this matters. Short version: without TURN, two people on restrictive networks
(mobile carriers, many campus networks) cannot connect to each other at all.

**coturn** is the standard self-hosted answer:

```bash
sudo apt install coturn
```

```conf
# /etc/turnserver.conf
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=<a long random secret>
realm=yourdomain.edu
cert=/etc/letsencrypt/live/yourdomain.edu/fullchain.pem
pkey=/etc/letsencrypt/live/yourdomain.edu/privkey.pem
# Without this, your TURN server will relay traffic to your internal network
# on behalf of anyone who asks. It is not optional.
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
```

Then implement `GET /api/turn-credentials` to return the same JSON shape the
Cloudflare version does — the client does not care who generated it:

```json
{
  "iceServers": [
    {
      "urls": ["turn:yourdomain.edu:3478", "turns:yourdomain.edu:5349"],
      "username": "<unix-timestamp>:<user>",
      "credential": "<base64 HMAC-SHA1 of username, keyed with static-auth-secret>"
    }
  ]
}
```

That username/credential pair is coturn's standard time-limited scheme: the
username is an expiry timestamp, and the credential is its HMAC. **Mint them
server-side.** Putting `static-auth-secret` in the client would let anyone on
the internet relay traffic through your server at your expense.

Ports 3478 (UDP and TCP) and 5349 (TCP, TLS) need to be reachable. TURN on 443
is worth configuring if your users sit behind firewalls that only allow web
traffic.

Two protections the Cloudflare path gives you that you now own yourself: the
**mint rate limit** (`TURN_MINTS_PER_WINDOW` in `worker/index.ts`), and the
**relayed-bitrate throttle** in `src/media/useRealtimeMedia.ts`. The throttle
is client-side and keeps working unchanged. The rate limit does not exist
until you write it.

---

## 7. Build and serve the client

Unchanged from the standard deployment:

```bash
npm install
npm run build        # -> dist/
```

Serve `dist/` as static files. Two requirements:

- **HTTPS is mandatory.** `getUserMedia`, `getDisplayMedia`, and WebXR all
  refuse to run on plain HTTP from anything but `localhost`. A self-signed
  certificate will make browsers complain; use Let's Encrypt or your
  institution's CA.
- **Fall back to `index.html`** for unknown paths (standard SPA rewrite).

Point the client at your room server with `VITE_SEIZA_ROOM_HOST` at build time,
or serve both from the same origin and leave it unset.

---

## 8. Checklist

- [ ] Room server accepts WebSockets at `/rooms/<id>` and implements the
      message types in `src/multiplayer/types.ts`
- [ ] All validation, sanitisation, and rate limits ported from `worker/room.ts`
- [ ] Per-room state persists across a restart
- [ ] Empty rooms are freed
- [ ] Upload endpoints match the existing URL shapes, with size limits enforced
      server-side and correct content types
- [ ] TLS on everything, from a CA browsers trust
- [ ] TURN reachable, credentials minted server-side, internal IP ranges denied
- [ ] `SEIZA_EDITOR_PASSWORD` / `SEIZA_ADMIN_KEY` equivalents wired up, compared
      in constant time
- [ ] Tested with **two people on different networks**, not two tabs on one
      machine — that is the only test that exercises NAT traversal

## 9. Licence

Seiza is AGPL-3.0-or-later. The AGPL's network clause applies to exactly this
situation: **if you run a modified version and let people use it over a
network, you have to offer those users your modified source.** Running it
unmodified, or modifying it privately without letting others use it, does not
trigger that.

A commercial licence exempting you from the AGPL is available — see
`COMMERCIAL-LICENSE.md`. This paragraph is a description of the licence, not
legal advice; if the distinction matters to your institution, ask a lawyer.
