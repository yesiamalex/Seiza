# Seiza

A serverless, deployer-owned reference architecture for self-hostable,
standards-based multiplayer WebXR. No central server the maintainers
operate — every deployment runs entirely on the deployer's own Cloudflare
account. Think: an open-source, self-hostable alternative to spaces like
FrameVR, but with no vendor operating the multiplayer backend for you —
you deploy it, you own the data and the bill.

Full technical writeup: `seiza_paper_draft.md` (draft, targeting a
Japanese XR conference, April 2027).

## What's in a deployment

- **A real default room out of the box** — procedurally generated
  (floor, walls, pillars, seating), no bundled 3D assets required. A
  deployer can layer their own glTF scene on top via `world.json`.
- **Movement** — desktop WASD + mouse-look, Shift to run, Space to jump
  (real gravity, not a canned animation), VR thumbstick locomotion,
  click-to-move in third person. First/third-person camera toggle with
  scroll-wheel zoom (FOV in first person, follow-distance in third).
  First person uses pointer lock (classic FPS mouse-look, click to
  capture the cursor); third person deliberately does not — click-drag
  orbits the view instead, cursor free otherwise, so you can inspect
  your own avatar or click HUD/floor without the camera fighting you.
- **Peer-to-peer voice chat** — WebRTC mesh, signaled through the same
  room server used for position sync, with a 3D speaking indicator and
  distance-based volume falloff. No separate media infrastructure; see
  the Status section below for the scaling ceiling this implies.
- **In-world editing** — anyone in a room can toggle Edit Mode and place
  primitives or paste in a custom glTF model URL, with drag-to-move and
  delete; placements persist per-room.
- **Text chat** — a lightweight room-wide chat panel alongside voice,
  relayed through the same room server (not persisted across reconnects).
- **Name tags** above every player, highlighting when that player is
  speaking.
- **Bring-your-own-avatar** — the join screen shows a live, rotatable
  3D preview (drag to orbit, scroll to zoom, drag-and-drop a file) and
  lets each person upload their own open-source/self-authored `.vrm`,
  stored in the deployer's own Cloudflare KV namespace (auto-expiring
  after 30 days), instead of being stuck with one fixed default avatar.
  An optional client-side optimization pass (via
  [glTF-Transform](https://github.com/donmccurdy/glTF-Transform),
  texture-only — see `src/avatar/optimizeVrm.ts` for why) can shrink
  oversized avatar files before upload, and silently no-ops rather than
  forcing a change if it wouldn't help.
- **Gesture playback** — VRMA clips (bow/seiza/wave scaffolded; see
  licensing note below) portable across any uploaded VRM, plus a
  procedural (not mocap — see `src/avatar/useProceduralGait.ts`)
  walk/run cycle driven by actual movement speed.

## Deploy your own instance

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/yesiamalex/Seiza)

Clicking this clones the repo into **your own** GitHub account and
provisions everything into **your own** Cloudflare account — nothing
touches infrastructure the maintainers run.

**This is a single deploy** — one Worker (`wrangler.jsonc` /
`worker/index.ts`) serves the static frontend, the `/api/avatars`
upload endpoint, and the realtime room server (`worker/room.ts`, a
Durable Object bound directly into the same Worker):

```bash
npm run worker:deploy   # builds, ensures the KV namespace exists, deploys everything
```

The first deploy provisions the `seiza-avatars` KV namespace in the
Cloudflare account you are logged into. The realtime Durable Object is
declared and migrated by `wrangler.jsonc`; you do not create a Durable
Object manually. The command may open Cloudflare's login page once. A
fork never uses the original deployment's KV data or Worker hostname.

This used to be two separate deploys — a Worker plus a room server
hosted on PartyKit. That's gone: PartyKit's last real release was over a
year old and its dev CLI had an unfixed Windows path bug that broke
local development entirely on some machines, so the room server was
ported onto a plain Cloudflare Durable Object instead (see
`worker/room.ts`'s header comment for the detail). One side effect of
an unmaintained dependency turning into a real problem: the deploy
story got simpler, not more complicated.

Avatars are stored in a Workers KV namespace (chosen over R2
specifically because R2 requires a payment method on file to activate
at all, even for free-tier usage — KV doesn't). The namespace is
created automatically the first time you build (`npm run build` runs
`scripts/ensure-kv-namespace.mjs`, which looks it up by title and
reuses it if it already exists) — including on Cloudflare's own
Git-connected build pipeline (Workers Builds), where there's no chance
to run a manual setup command before the first deploy. If it still
fails with a permissions error, create the namespace once yourself
(Cloudflare dashboard → Workers & Pages → KV → Create namespace →
`seiza-avatars`), then retry `npm run deploy`. No Durable Object manual
setup is required.

> **Tradeoff to know about:** KV is eventually consistent (global
> propagation can lag), unlike R2's strong read-after-write. A
> freshly-uploaded avatar could briefly 404 for someone at a different
> edge location right after upload. Acceptable for this project's
> classroom scale; worth knowing if you're evaluating it for something
> more real-time-critical.

## Local development

```bash
npm install
cp .env.example .env.local     # then edit as needed
npm run build && npm run worker:dev   # Worker + room server, separate terminal
npm run dev                    # frontend, with hot reload
```

Open the frontend dev server URL (not the Worker's). On first run you'll
land on the join screen, then a real procedurally-built room — see
`public/worlds/default/README.md` for what is and isn't bundled, and
`THIRD_PARTY_ASSETS.md` before adding any 3D asset to the repo.

The normal local flow is two terminals:

```bash
npm run worker:dev
npm run dev
```

The frontend's `/api` and `/rooms` requests are proxied to the local Worker.
Do not set `VITE_SEIZA_ROOM_HOST` unless you deliberately run the room server
on another host.

### Fork and customize

1. Fork the repository and clone your fork.
2. Run `npm install`, then `npm run deploy` after logging into Cloudflare.
3. Open the URL printed by Wrangler.
4. Customize `public/worlds/default/world.json`, or copy that folder to a new
  world id and set `VITE_SEIZA_WORLD_ID` before building.

The app uses relative `/worlds`, `/api`, and `/rooms` paths. The same build
therefore works on a `workers.dev` URL, a Cloudflare custom domain, or a
Worker route without editing an origin URL. Uploaded avatars and room data
belong to the account that deployed the fork. Only add scenes, avatars,
gesture clips, fonts, or other media when their licenses permit your use;
review `THIRD_PARTY_ASSETS.md` and retain required attribution.

### Asset responsibility

Seiza is a hosting tool, not an asset rights service. Users and deployers are
responsible for obtaining permission for models, environments, avatars,
animations, textures, and other uploaded files. The project does not verify
licenses or accept responsibility for copyright or other rights disputes.
Keep source and license records, honor takedown or DMCA requests where they
apply to your deployment, and disable uploads when a closed asset policy is
needed.

### World Labs / Atlas exports

World Labs' public documentation currently describes Marble's web creation and
export workflow; it does not provide a stable public Atlas generation endpoint
that this project can safely hard-code. Seiza already accepts exported GLB or
glTF environments through `sceneUrl` in `world.json`, so an exported world can
be used without changing the multiplayer runtime. Keep any future World Labs
API key in a Worker secret such as `WORLD_LABS_API_KEY`, never in `.env.local`
committed to a fork or in browser JavaScript. A server-side integration should
wait for the provider's documented API, terms, export format, polling, and
privacy guarantees rather than proxying an invented endpoint.

`wrangler dev` simulates the Worker, KV, and the Durable Object room
server locally (via Miniflare) with no Cloudflare login required — this
was verified end-to-end (real WebSocket connect/join/broadcast/
disconnect against a local `wrangler dev` instance) while building this,
not just assumed to work.

## Customizing a deployment ("one world per deployment")

Fork, edit `public/worlds/<your-id>/world.json`, set
`VITE_SEIZA_WORLD_ID` to match. No application code changes needed —
see `src/config/worldConfig.ts`. Per-world flags let you turn off
in-world editing (`editingEnabled: false`) or avatar uploads
(`allowAvatarUpload: false`) for a given deployment without touching
code.

### Restricting who can edit

By default, if `editingEnabled` is true, *anyone* in the room can place,
move, or delete objects — there's no per-user permission system (see
Status below). To require a shared password before Edit Mode actually
does anything, set a Worker secret (never commit this to the repo):

```bash
npx wrangler secret put SEIZA_EDITOR_PASSWORD
```

For local dev, put the same value in a `.dev.vars` file (gitignored) as
`SEIZA_EDITOR_PASSWORD=whatever`. Leaving it unset keeps editing open to
everyone, unchanged from before this existed. This is one shared
password, not per-user accounts or roles — intentionally the leanest
thing that could plausibly work for a self-hosted classroom room; see
worker/room.ts's comment on `MAX_AUTH_ATTEMPTS` for the (limited) abuse
protection this does and doesn't provide.

## Project layout

```
src/            frontend (React Three Fiber + WebXR + VRM)
  avatar/       VRM loading, VRMA gesture playback
  player/       local movement (desktop WASD/mouse-look, VR locomotion)
  multiplayer/  realtime client, remote-player rendering, protocol types
  voice/        WebRTC voice mesh, signaled through the room server
  edit/         in-world object placement/move/delete UI
  scene/        procedural base environment + deployer scene.glb overlay
  ui/           join screen, HUD
  interactions/ pedagogical interaction modules (gesture-match game, more TBD)
worker/         Cloudflare Worker: static hosting, avatar upload API (KV),
                and the realtime room server (room.ts, a Durable Object)
public/worlds/  per-deployment world configs — the customization surface
scripts/        setup-time asset fetching for non-bundled, license-restricted assets
```

## Licensing

Dual-licensed: **AGPL-3.0-or-later** (`LICENSE`) for open/self-hosted
use, or a **commercial license** (`COMMERCIAL-LICENSE.md`) for
proprietary/closed use. Contributions require a CLA before merge — see
`CONTRIBUTING.md`. 3D assets are licensed separately from the code — see
`THIRD_PARTY_ASSETS.md`, including the note there on user-uploaded
avatars, which are the uploader's responsibility, not curated by anyone.

## Status

No longer a bare scaffold — movement, voice, editing, and avatar upload
are real and working — but still short of production-hardened. Known,
deliberate limitations (paper Section 7 has the fuller discussion):

- **Voice is a WebRTC mesh, not an SFU.** Cost is O(n²) in simultaneously
  connected peers; the client soft-caps auto-connect around 12 (see
  `src/voice/useVoiceChat.ts`). Fine for classroom-sized rooms, not for
  large open events. No TURN server is configured by default — only
  Cloudflare's public STUN — so voice may not connect for peers behind
  restrictive NATs unless a deployer sets `VITE_SEIZA_TURN_URLS`.
- **Permissions are one shared password, at most.** With
  `SEIZA_EDITOR_PASSWORD` unset (the default), anyone can edit. With it
  set, editing requires that one password — still not per-user accounts,
  roles, or moderation, and anyone can join a room at all regardless.
  Room-wide guardrails that ARE enforced server-side regardless of
  permissions: a cap on total placed objects, per-connection chat rate
  limiting, and pasted model URLs are restricted to http(s) (see
  `worker/room.ts`).
- **Avatar-upload rate limiting is best-effort.** `worker/index.ts` uses
  a per-isolate in-memory counter, not Cloudflare's real Rate Limiting
  rules — adequate for low-traffic self-hosted use, not for a deployment
  that expects meaningful public load.
- **Multiplayer sync is untested at scale.** Works correctly in small
  local testing; no load testing has been done against `maxOccupants`-
  sized rooms.
- **No world/object physics.** Movement bounds are a simple radius clamp
  (no collision with walls or placed objects), and placed objects don't
  fall, roll, or collide — there's no rigid-body simulation. VRM's own
  spring-bone physics (hair/skirt secondary motion) is real and does run
  via `vrm.update()`, so avatars aren't *entirely* without physics. A
  real object physics layer (e.g.
  [@react-three/rapier](https://github.com/pmndrs/react-three-rapier))
  is a large enough addition — new dependency, collision authoring for
  BaseEnvironment, network sync implications — that it's future work to
  scope deliberately, not something to bolt on inline.
- **The walk/run cycle is procedural, not a real animation clip.** No
  redistribution-clear "universal rig" mocap walk/run VRMA exists in this
  repo to bundle — same THIRD_PARTY_ASSETS.md diligence that applies to
  gestures. `useProceduralGait.ts`'s sine-wave limb swing is a stand-in;
  it blends continuously around each bone's own captured rest rotation
  now (an earlier version snapped to/from literal T-pose while idle,
  visible as arms unnaturally held out and spring-bone hair overreacting
  to the discontinuity — fixed), but the swing's direction/axis still
  hasn't been visually verified against a real uploaded VRM, only
  reasoned about from the VRM normalized-bone spec.
- **Chat has no history.** Room text chat is relay-only, not persisted —
  reconnecting or a new joiner starts with an empty chat panel.
- **Avatar optimization is texture-only, by design.** It resizes/re-encodes
  oversized textures via glTF-Transform, but deliberately never touches
  mesh/node/accessor structure, because no VRM extension package exists
  for glTF-Transform to safely reason about humanoid bone references or
  blend shapes during structural transforms — see the reasoning in
  `src/avatar/optimizeVrm.ts`.
- **Click-to-move walks in a straight line, not around obstacles.** No
  navmesh — a player can path directly into a wall/pillar/placed object
  and just stop there rather than routing around it. A real fix would be
  [recast-navigation](https://github.com/isaac-mason/recast-navigation-js)
  (WASM Recast/Detour, can generate a navmesh directly from the existing
  procedural `BaseEnvironment` geometry at runtime) rather than
  `three-pathfinding` (donmccurdy, lighter, but expects a pre-authored
  navmesh file — awkward for geometry that's generated in code, not
  authored in Blender). Not implemented — noted as the concrete next step
  if this becomes worth doing.
- **Navmesh upload is intentionally not enabled yet.** Current guidance from
  Recast Navigation is to use a serialized Recast/Detour navmesh for direct
  querying, or export a glTF navmesh and consume it with a pathfinding layer
  such as `three-pathfinding`. Seiza's current movement controller has no
  query/path integration, so accepting a file today would falsely imply that
  it protects the environment. The planned implementation must validate the
  uploaded mesh, show parse errors, preserve the procedural environment as a
  fallback, and use the same editor permissions as world assets.
