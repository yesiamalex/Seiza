# Run Seiza somewhere other than Cloudflare

This guide is for a school, organization, or individual who wants to run
Seiza on their own infrastructure, such as a university VM, a VPS, a NAS, or
an on-premises server, instead of on Cloudflare Workers.

> **Important:** Seiza is built for Cloudflare, and porting it is an
> engineering project, not a configuration change. The standard deployment in
> [DOCS.md](DOCS.md) is one command; this is a fork. Read
> [section 1](#1-decide-whether-you-need-to-port) first to decide whether you
> need it.

## 1. Decide whether you need to port

The standard deployment already covers the most common concerns:

| Concern | Does porting help? |
| --- | --- |
| "We don't want a vendor holding our data." | **No.** The standard deployment already keeps every room, asset, and avatar in your own Cloudflare account. The Seiza project can't see or access it. |
| "We can't afford it." | **No.** A classroom-sized deployment fits in Cloudflare's free tiers. Self-hosting costs you a machine and the time to maintain it. |
| "We want to modify it." | **No.** Seiza is licensed under AGPL-3.0-or-later. You can fork and modify it on Cloudflare. |
| "Our institution doesn't allow third-party cloud services, or requires data to stay in-country or on-premises." | **Yes.** This is the main reason to port. |
| "Our network is air-gapped, or blocks outgoing traffic." | **Yes**, with some caveats. See [section 6](#6-set-up-turn-without-cloudflare). |
| "We want to learn how it works." | Yes. |

If one of the "Yes" rows applies to you, continue. Otherwise, use the
standard deployment in [DOCS.md](DOCS.md), which takes an afternoon. A port
takes much longer.

## 2. Understand what you're replacing

Seiza's server code is small (two files), but it depends on three Cloudflare
services, and each needs a replacement.

| Cloudflare service | What it does for Seiza | Replace it with |
| --- | --- | --- |
| **Worker** (`worker/index.ts`) | Serves the built client, handles uploads and downloads, and creates TURN credentials | Any HTTP server, such as Node, Deno, Bun, Go, or nginx with a small app |
| **Durable Object** (`worker/room.ts`) | Runs exactly one stateful instance per room. Holds player state, placed objects, and the room password, and relays WebRTC signaling. | A WebSocket server with one in-memory room object per room ID, plus storage for each room's state |
| **Workers KV** | Stores uploaded avatars (`.vrm`), models, and images | The file system, S3, MinIO, or any other blob store |

You don't need to replace two parts:

- **The client.** `src/` is a standard Vite and React app. It builds to
  static files and works with any server.
- **Voice, camera, and screen sharing.** These use peer-to-peer WebRTC
  between browsers. Your server only relays a few signaling messages, which
  is why Seiza is cheap to host.

The Durable Object is the part that needs the most care. Cloudflare
guarantees **exactly one instance per room ID, globally**, with no work on
your side: two people opening the same room always reach the same instance.
A single server process gives you the same guarantee. Multiple processes
behind a load balancer don't, so two people in "the same" room can end up on
different servers and never see each other. See
[section 5](#5-avoid-the-scaling-trap).

## 3. Choose an approach

### Option A: Keep Cloudflare for the room server only (easiest)

You don't have to move everything at once. Serve the static client from your
own domain, and keep the Worker only for the room server. Set
`VITE_SEIZA_ROOM_HOST` to point at it. Your users visit your hostname, and
room state stays on Cloudflare.

Check whether this meets your institution's policy before you start a full
port. It takes an afternoon rather than a project.

### Option B: Port the Worker to Node (most common)

Reimplement `worker/index.ts` and `worker/room.ts` on Node. Both the client
and the server import the protocol from `src/multiplayer/types.ts`, so a
correct server is one that satisfies the types in that file.

Here's the rough structure using `ws` and `express` (Fastify works too):

```js
// One room object per room ID. This Map replaces the Durable Object namespace.
const rooms = new Map();

function getRoom(id) {
  if (!rooms.has(id)) {
    rooms.set(id, {
      objects: new Map(),       // placed world objects
      environmentUrl: null,
      skyboxUrl: null,
      roomPassword: null,
      sockets: new Set(),       // each with an attachment: {connId, player, isEditor, isAdmin}
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
  ws.on("close", () => { /* remove the player and broadcast playerLeft */ });
});
```

Then port the `switch (message.type)` block from `worker/room.ts`, almost
unchanged.

**Port the validation and rate limits too.** They aren't specific to
Cloudflare, and they protect your room from a misbehaving client. Keep:

- The minimum interval for each action.
- The cap on placed objects.
- `sanitizeAssetUrl`, `sanitizeDisplayName`, and `sanitizeText`.
- The bounds checks on positions, and the `headPitch` clamp.
- The sign-in attempt counters.

You also need to handle three differences from the Durable Object version:

- **There's no hibernation.** Replace `serializeAttachment` and
  `deserializeAttachment` with a plain object kept next to each socket, and
  remove the hibernation code.
- **You handle persistence.** `ctx.storage` isn't available. Placed objects,
  the environment and skybox overrides, and the room password need to be
  stored somewhere, or they're lost on restart. SQLite is more than enough;
  a JSON file per room works for a classroom.
- **You clean up empty rooms.** A Durable Object removes itself from memory
  when it's idle; your `Map` doesn't. Delete a room when its last socket
  closes, or memory will leak.

### Option C: Docker Compose, fully on-premises

For an air-gapped or fully on-premises deployment, combine:

- The Node server from Option B.
- nginx in front, for TLS and static files.
- MinIO or a mounted volume for uploads.
- **coturn** for TURN (see [section 6](#6-set-up-turn-without-cloudflare)).

This is the most work, and the only option with no external dependencies.

## 4. Handle uploads

`worker/index.ts` stores uploads in Workers KV under content-addressed keys
and serves them back. What matters is the behavior, not KV itself:

- **Enforce size limits on the server.** The client checks too, but the client
  isn't a security boundary. The current limits are 24 MB for avatars and
  models, and 3 MB for images. Choose your own limits if you like, but
  enforce some.
- **Keep the same URL formats**, `/api/avatars/<id>.vrm` and
  `/api/assets/<id>.<ext>`, or the client won't find files.
- **Serve the correct `Content-Type` headers.** A `.vrm` file served as
  `text/html` fails to load with a confusing error.
- **Set CORS headers** if uploads are on a different origin from the page.
- **Decide on avatar retention.** KV deletes avatars after 30 days. Nothing
  depends on that, so keeping them forever only affects storage growth.

The file system works well for a single-server deployment. Use a content hash
as the file name to keep the same deduplication that KV provides.

## 5. Avoid the scaling trap

This mistake costs the most time, so it has its own section.

**Don't run two room server instances behind a round-robin load balancer.**
Room state lives in the memory of the process that owns the room. With two
instances, two people who joined "the same" room can be in different rooms,
each seeing an empty space, and the logs won't show it.

Your options, from least to most work:

1. **Use one process.** This is fine for a school. Node handles hundreds of
   WebSocket connections easily, and Seiza's room traffic is small because
   media never touches the server. Start here.
2. **Route by room ID.** Configure nginx or HAProxy to hash the room ID and
   send all traffic for a room to the same backend. This is what a Durable
   Object does for you.
3. **Share state,** with Redis pub/sub or similar. Do this only if you need
   horizontal scaling, which classroom use almost never does.

The real capacity limit isn't the server anyway. It's the WebRTC mesh: every
participant connects to every other one, so the cost grows with the square
of the room size. With voice, this becomes a problem at around 12 people, and
server-side scaling doesn't change that. Going further needs an SFU.

## 6. Set up TURN without Cloudflare

For why TURN matters, see
[Voice and video across networks](DOCS.md#voice-and-video-across-networks).
In short, without TURN, two people on restrictive networks, such as mobile
carriers and many campus networks, can't connect to each other.

**coturn** is the standard self-hosted TURN server.

1. Install it:

   ```bash
   sudo apt install coturn
   ```

2. Configure it:

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
   # Required: without these lines, your TURN server relays traffic into
   # your internal network for anyone who asks.
   denied-peer-ip=10.0.0.0-10.255.255.255
   denied-peer-ip=172.16.0.0-172.31.255.255
   denied-peer-ip=192.168.0.0-192.168.255.255
   ```

3. Implement `GET /api/turn-credentials` to return the same JSON as the
   Cloudflare version. The client doesn't care which server created it.

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

4. Make ports 3478 (UDP and TCP) and 5349 (TCP, TLS) reachable. If your users
   are behind firewalls that only allow web traffic, also configure TURN on
   port 443.

The username and credential use coturn's standard time-limited scheme: the
username is an expiry timestamp, and the credential is its HMAC. **Create
them on the server.** If you put `static-auth-secret` in the client, anyone
on the internet could relay traffic through your server at your expense.

The Cloudflare version includes two safeguards. You now need to provide one
of them yourself:

- **The credential rate limit** (`TURN_MINTS_PER_WINDOW` in
  `worker/index.ts`) doesn't exist until you write it.
- **The relayed bitrate limit** in `src/media/useRealtimeMedia.ts` runs in the
  client, so it keeps working unchanged.

## 7. Build and serve the client

Building the client is the same as for the standard deployment:

```bash
npm install
npm run build        # outputs to dist/
```

Serve `dist/` as static files, with two requirements:

- **Use HTTPS.** `getUserMedia`, `getDisplayMedia`, and WebXR don't run on
  plain HTTP, except on `localhost`. Browsers warn about self-signed
  certificates, so use Let's Encrypt or your institution's certificate
  authority.
- **Serve `index.html` for unknown paths** (a standard single-page app
  rewrite).

To point the client at your room server, set `VITE_SEIZA_ROOM_HOST` at build
time, or serve both from the same origin and leave it unset.

## 8. Checklist

- [ ] The room server accepts WebSockets at `/rooms/<id>` and implements the
      message types in `src/multiplayer/types.ts`.
- [ ] All validation, sanitization, and rate limits from `worker/room.ts` are
      ported.
- [ ] Each room's state survives a restart.
- [ ] Empty rooms are freed.
- [ ] Upload endpoints match the existing URL formats, enforce size limits on
      the server, and serve the correct content types.
- [ ] Every service uses TLS from a certificate authority that browsers
      trust.
- [ ] TURN is reachable, credentials are created on the server, and internal
      IP ranges are denied.
- [ ] Equivalents of `SEIZA_EDITOR_PASSWORD` and `SEIZA_ADMIN_KEY` are set
      up and compared in constant time.
- [ ] You tested with **two people on different networks**, not two tabs on
      one computer. Only that tests NAT traversal.

## 9. License

Seiza is licensed under AGPL-3.0-or-later. The AGPL's network clause applies
to this situation: **if you run a modified version and let people use it over
a network, you must offer those users your modified source code.** Running
Seiza unmodified, or modifying it without letting others use it, doesn't
trigger this requirement.

A commercial license that exempts you from the AGPL is available. See
`COMMERCIAL-LICENSE.md`. This section describes the license; it isn't legal
advice. If the distinction matters to your institution, ask a lawyer.
