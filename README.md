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
- **Movement** — desktop WASD + mouse-look, VR thumbstick locomotion.
- **Peer-to-peer voice chat** — WebRTC mesh, signaled through the same
  room server used for position sync. No separate media infrastructure;
  see the Status section below for the scaling ceiling this implies.
- **In-world editing** — anyone in a room can toggle Edit Mode and place
  primitives or paste in a custom glTF model URL, with drag-to-move and
  delete; placements persist per-room.
- **Bring-your-own-avatar** — the join screen lets each person upload
  their own open-source/self-authored `.vrm`, stored in the deployer's
  own R2 bucket, instead of being stuck with one fixed default avatar.
- **Gesture playback** — VRMA clips (bow/seiza/wave scaffolded; see
  licensing note below) portable across any uploaded VRM.

## Deploy your own instance

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=REPLACE_WITH_THIS_REPO_URL)

Clicking this clones the repo into **your own** GitHub account and
provisions everything into **your own** Cloudflare account — nothing
touches infrastructure the maintainers run.

The deploy is two pieces, and that's a deliberate, documented choice
(see the comment in `wrangler.jsonc`), not an oversight:

1. **This Worker** (`wrangler.jsonc` / `worker/index.ts`) — serves the
   static frontend and the `/api/avatars` upload endpoint, backed by an
   R2 bucket. The bucket is created automatically the first time you
   build (`npm run build` runs `scripts/ensure-r2-bucket.mjs`, which is
   a no-op if it already exists) — including on Cloudflare's own
   Git-connected build pipeline (Workers Builds), where there's no
   chance to run a manual setup command before the first deploy. Locally:
   ```bash
   npm run worker:deploy   # builds, ensures the R2 bucket exists, deploys
   ```
   If that still fails with an R2 permissions error, create the bucket
   once yourself (Cloudflare dashboard → R2 → Create bucket →
   `seiza-avatars`, or `npx wrangler r2 bucket create seiza-avatars` with
   credentials that can manage R2) and retry.
2. **The realtime room server** (`party/room.ts`) — deploys separately
   via PartyKit's own control plane on top of Durable Objects:
   ```bash
   npm run party:deploy
   ```
   Then set `VITE_SEIZA_PARTY_HOST` (in your Worker's env vars) to the
   host PartyKit gives you, and rebuild/redeploy the Worker.

## Local development

```bash
npm install
cp .env.example .env.local     # then edit as needed
npm run party:dev              # realtime room server, separate terminal
npm run build && npm run worker:dev   # Worker (static + avatar upload API), separate terminal
npm run dev                    # frontend, with hot reload
```

Open the frontend dev server URL (not the Worker's). On first run you'll
land on the join screen, then a real procedurally-built room — see
`public/worlds/default/README.md` for what is and isn't bundled, and
`THIRD_PARTY_ASSETS.md` before adding any 3D asset to the repo.

> **Known issue on Windows:** `npm run party:dev` (PartyKit's own CLI,
> v0.0.111) has been observed crashing immediately with `TypeError:
> Invalid URL` / `ERR_INVALID_URL` in its internal build step on Windows
> — a bug in PartyKit's own path handling, not in this repo's code. If
> you hit this, try running it under WSL, or check whether a newer
> `partykit` release has fixed it before assuming it's something you did.

## Customizing a deployment ("one world per deployment")

Fork, edit `public/worlds/<your-id>/world.json`, set
`VITE_SEIZA_WORLD_ID` to match. No application code changes needed —
see `src/config/worldConfig.ts`. Per-world flags let you turn off
in-world editing (`editingEnabled: false`) or avatar uploads
(`allowAvatarUpload: false`) for a given deployment without touching
code.

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
party/          realtime room server (PartyKit / Durable Objects)
worker/         Cloudflare Worker: static hosting + avatar upload API (R2)
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
- **No permissions system.** Anyone connected to a room can edit the
  world (place/move/delete objects) or, currently, join at all — there's
  no moderation, host role, or room password yet.
- **Avatar-upload rate limiting is best-effort.** `worker/index.ts` uses
  a per-isolate in-memory counter, not Cloudflare's real Rate Limiting
  rules — adequate for low-traffic self-hosted use, not for a deployment
  that expects meaningful public load.
- **Multiplayer sync is untested at scale.** Works correctly in small
  local testing; no load testing has been done against `maxOccupants`-
  sized rooms.
- **No physics/collision.** Movement bounds are a simple radius clamp,
  not real collision with walls or placed objects.
