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

- **A real default world out of the box** — a daylit social hall with
  benches around a tatami platform, a corridor of shoe lockers, and a
  classroom with desks facing a chalkboard. Every chair and bench can be
  sat on. It's all generated from code, including the wood and tatami
  textures and the sky, so no 3D assets are bundled and nothing is fetched
  from someone else's CDN. A deployer can layer their own glTF scene on top
  via `world.json`.
- **Movement** — WASD or arrow keys, Shift to run, Space to jump (real
  gravity), VR thumbstick locomotion, and double-click the floor to walk
  there along a navmesh route. Look around by dragging, the way FrameVR
  works. There is no pointer lock anywhere, so the cursor always stays free
  for the HUD and the editor. First/third-person toggle with scroll zoom
  (field of view in first person, follow distance in third). In third
  person your avatar turns smoothly to face where it walks. Click a chair
  or bench to sit down properly on it; moving stands you back up.
- **Peer-to-peer voice chat** — WebRTC mesh, signaled through the same
  room server used for position sync, with a 3D speaking indicator and
  distance-based volume falloff, so walking closer makes someone easier to
  hear. No separate media infrastructure; see the Status section below for
  the scaling ceiling this implies. It's on unless a deployment turns it
  off with `voiceEnabled` in `world.json` (or the
  `VITE_SEIZA_VOICE_ENABLED=false` build flag).
- **Mobile/touch support** — phones and tablets get a four-way D-pad, a
  jump button, and Minecraft-style double-tap-forward to sprint. Drag to
  look, pinch to zoom, double-tap the floor to walk there. The controls
  appear on touch-first devices and update live if that changes, such as a
  tablet docked to a keyboard. Panels dock to the screen edges on narrow
  screens so nothing runs off-screen.
- **In-world editing** — anyone in a room can toggle Edit Mode and place
  primitives or paste in a custom glTF model URL, with drag-to-move and
  delete; placements persist per-room.
- **Placeable chairs** — a chair is one of the default objects in Edit Mode,
  and it's the same chair the classroom uses, so anyone can sit on one the
  moment it's placed. Leave Edit Mode and click it, exactly like a built-in
  seat.
- **Pictures and video on the walls** — upload an image and it's hung in
  front of you as a framed panel, sized to its own aspect ratio; add a video
  by link and it plays muted and looping on a panel, decoding only while
  someone is near enough to see it. Images are downscaled and re-encoded to
  WebP in your browser before upload, so a phone photo costs the deployment
  a few hundred kilobytes instead of several megabytes. Video is
  deliberately by link only — see "Where uploads go" below.
- **Custom environments, swappable live** — upload a `.glb`/`.gltf` world
  from Edit Mode and it becomes the room's environment for everyone
  immediately, persisted in the room's Durable Object and restored for
  later joiners. "Reset to default" returns to the deployment's own
  `world.json` scene (or the procedural room). Same editor permissions
  and same validation as any other uploaded asset.
- **Text chat** — a lightweight room-wide chat panel alongside voice,
  relayed through the same room server (not persisted across reconnects).
- **Name tags** above every player, highlighting when that player is
  speaking.
- **Avatars, three ways** — on the join screen and in the in-world avatar
  menu (`C`), each with a live, rotatable 3D preview:
  - *Design*: a built-in avatar designer (skin, hair, eyes, clothing,
    accessories, height, build) with ready presets such as businessman,
    businesswoman, and casual. Designed avatars are generated in code and
    shared as a few hundred bytes of settings, so nothing is uploaded and
    there is no asset license to check.
  - *Presets*: a deployment's own `.vrm` files from `world.json`.
  - *Upload VRM*: your own VRM 0.x or 1.0 file, stored in the deployer's
    KV namespace for 30 days. An optional texture-only optimization pass
    via [glTF-Transform](https://github.com/donmccurdy/glTF-Transform)
    shrinks oversized files and skips itself when it wouldn't help (see
    `src/avatar/optimizeVrm.ts`).

  Changing your avatar in-world updates everyone without reconnecting.
- **Remembered on your device** — your name and avatar are kept in this
  browser's IndexedDB, including an uploaded file. Your own avatar then
  loads instantly on return, and is re-uploaded automatically if the
  deployment's copy has expired. The join screen has a switch to turn this
  off on shared computers.
- **Animation and gestures** — idle, walk, and run clips blend by actual
  ground speed, and ten built-in gestures play on any avatar: wave, bow
  (ojigi), seiza, nod, clap, cheer, shrug, point, gasshō (palms together
  for thanks), and a raised hand. They are VRM Animation clips generated by
  a script in this repo, so there's no licensing question. Deployers can add
  their own `.vrma` clips, or replace built-ins, in `world.json`. Press
  `1`–`9` and `0` on desktop.
- **Held poses** — the raised hand stays up for as long as you hold the key,
  rather than looping or replaying, so it can't be spammed. Seiza and sitting
  are postures: they stay until you press the key again, click Stand up, or
  simply move. Postures are tracked separately from gestures, so a seated or
  kneeling player who waves stays put on everyone else's screen.
- **Furniture you can't walk through** — benches, desks, the reception
  counter, lockers, posts and planters all push you around them, and the
  tatami platform is a real step up. The third-person camera stays inside the
  building instead of zooming out through a wall.

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

### Where uploads go, and why video isn't one of them

Avatars, models and images all live in one Workers KV namespace. KV was
chosen over R2 because R2 requires a payment method even on its free tier
and this is meant to be deployable by anyone forking the repo with no
billing setup — see the tradeoff note at the top of `worker/index.ts`.

That choice sets the budget: 25MiB per value, hard, and 1GB of storage in
total on the free tier. So each kind of upload gets a ceiling that matches
what it's for.

| What | Limit | Retention |
| --- | --- | --- |
| Avatar (`.vrm`) | 24MB | 30-day TTL — ephemeral, uploader-owned |
| Model (`.glb`/`.gltf`) | 24MB | Kept until deleted |
| Image (PNG/JPEG/WebP/GIF) | 3MB server-side; the editor targets ~500KB | Kept until deleted |
| Video | Not uploadable | n/a |

Images are re-encoded client-side first (`src/edit/compressImage.ts`):
downscaled to at most 2048px on the long edge, then encoded as WebP with the
quality stepped down until it fits the target. The server's 3MB limit is a
backstop for anything that skipped that path, not the normal size. At ~500KB
a picture, a deployment gets roughly two thousand of them per free gigabyte.

Video is referenced by URL and never stored here. One clip would take a
meaningful share of the whole storage budget; KV serves whole values with no
range requests, so seeking would re-download the file; and every viewer in
every Cloudflare colo costs a fresh read. Point a video object at any https
URL that serves an MP4 or WebM with CORS allowed and let whoever already
hosts it serve it. Image and video URLs go through the same scheme
validation as models and avatars (`sanitizeAssetUrl` in `worker/room.ts`) —
placing one makes every other browser in the room fetch it, so `javascript:`,
`data:` and protocol-relative URLs are rejected.

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

## Avatars, animation, and gestures: notes for forkers and reviewers

### Controls

| Action | Desktop | Touch |
|---|---|---|
| Move | WASD or arrow keys | D-pad |
| Run | Hold Shift | Double-tap forward and hold |
| Jump | Space | Jump button |
| Look | Drag with any mouse button | Drag with one finger |
| Orbit around yourself | Drag in third person | Drag in third person |
| Look in Edit Mode | Drag with right or middle button | Drag with two fingers |
| Zoom toward yourself | Scroll | Pinch |
| Walk to a spot | Double-click the floor | Double-tap the floor |
| Sit down | Click a chair or bench | Tap a chair or bench |
| Place a chair | Edit Mode → Chair | Edit Mode → Chair |
| Kneel (seiza) | `3`, and `3` again to stand | The Seiza button |
| Stand up | Move, jump, or the Stand up button | D-pad, or the Stand up button |
| Switch view | `V` or the camera button | Camera button |
| Avatar menu | `C` or the Avatar button | Avatar button |
| Gestures | `1`–`9`, `0`, or the Gestures menu | Gestures menu |
| Hold a pose | Hold its number key | Press and hold its button |

The controls sit in one dock at the bottom of the screen, and it never
wraps. That isn't only cosmetic: a second row made the bar's height depend
on how many controls happened to be showing, so everything anchored above it
— popovers, the notice toast — moved whenever you sat down or started
sharing. Below 960px the dock drops its text labels and becomes icons, each
keeping its accessible name from `aria-label`; below 640px it scrolls
sideways as a last resort, and its popovers switch to `position: fixed` so
they dock to the viewport instead of being clipped by that scroll container.

### The built-in world

`src/scene/layout.ts` is the floor plan, and three systems read it so they
can't disagree: the geometry in `BaseEnvironment.tsx`, the movement bounds
in `PlayerRig.tsx`, and the list of seats. It defines three rectangles —
hall, corridor, classroom — and `clampToRooms` keeps players inside their
union, which is also what makes the corridor the only way between the two
rooms. The old bounds were a single circle, which couldn't express that.

`materials.ts` draws the wood, tatami and plaster textures onto a canvas at
startup and shares one material instance per surface across the few hundred
meshes. Lighting is lights plus drei's `<Sky>` shader rather than an
image-based environment map, because drei's `<Environment preset>`
downloads an HDR from a third-party CDN — which a deployment that is
supposed to run entirely on the deployer's own infrastructure shouldn't
depend on, and which would leave the room dark whenever that host is
blocked.

Seats come from the same file. Each one is a position and a facing; a click
pad floats invisibly above each chair and bench, and is excluded from the
navmesh (`navIgnore`) so those pads don't become little walkable platforms
in mid-air. Sitting eases the player onto the seat, a little forward of its
middle so their back isn't buried in the backrest, faces them the way the
seat faces, and hands movement input back as a request to stand, so nobody
can get stuck in a chair. `standUpSpot` picks where they end up: behind the
seat if that's clear, otherwise to a side or a diagonal, because stepping
back off a classroom chair would otherwise walk them into the desk behind.

Chairs a player places in Edit Mode use the same `Chair` component and the
same materials as the room's own, and get a seat built by `placedChairSeat`
in `layout.ts`. That function exists because the seat has to be derived from
the chair rather than stored beside it: it offsets forward of the chair's
centre by the same `SEAT_FORWARD_OFFSET` the built-in seats use, and it
raises the floor it reports by the chair's scale — the sitting pose is
grounded to `SEAT_HEIGHT` above whatever floor the seat gives it, so a chair
scaled up would otherwise seat its occupant in mid-air below the cushion.
Checked numerically at several scales, heights and rotations. Placed chairs
aren't obstacles, the same as every other placed object; seat occupancy is
local-only, as it is for the built-in seats, so two people can share a chair.

Furniture collision is a list of boxes in the same file, resolved by pushing
a walker out along whichever axis they're least far inside. A desk and its
chair are deliberately one box rather than two: as separate boxes the gap
between them is narrower than a person, and a walker got squeezed back and
forth between the pair. The numbers are checked by measurement — the aisles
are wide enough to walk down, and every seat has a free spot to stand up
into.

Avatars get a soft blob shadow rather than a real cast shadow. A skinned mesh
has to be re-rendered into the shadow map every frame it moves, which is the
per-frame cost the rest of the world deliberately avoids; a textured disc
costs one draw call and still says where someone's feet are.

The first-person camera bobs while you walk. It's driven by distance
travelled rather than by a clock, so the rhythm stays locked to the
footsteps at any speed instead of drifting when you speed up or get pushed
along a wall: one stride is a full cycle, the head dips twice in it (once
per foot) and sways once, with a little roll. It moves the *render* camera
only — the virtual camera that the networked position, the avatar's
placement and every raycast come from never sees it, so bobbing can't nudge
you through a wall or make a seat harder to click. It fades out when you
stop, when you're airborne and while you're seated, and
`prefers-reduced-motion` turns it off entirely. There's no bob in VR, where
moving the view out from under someone's head is a good way to make them
ill.

The third-person camera orbits a point at the avatar's chest rather than
sitting behind the eye and looking wherever the eye looks. That keeps the
character centred at any angle and makes zoom move toward them instead of
past them. It's held inside the building on all sides, including above:
`ceilingHeightAt` caps it below the roofline, since the hall's ceiling is
open beams and the camera would otherwise drift up and show a roofless set.

Windows are real openings. The wall's plaster layer splits into three bands
(below the sill, the window band, above the header) and the window band gets
a length-wise gap per window, reusing the same mechanism doorways use. The
frame is four bars around an open pane — it used to be a single solid box
spanning the whole opening, which is why cutting a hole in the wall behind it
changed nothing you could see.

What you see through them is `src/scene/Outdoors.tsx`: a ground disc painted
procedurally onto a canvas, an instanced treeline, instanced hills on the
horizon, and distance fog that starts well past the building so nothing
indoors is tinted. Four draw calls, no downloads, and deterministic from a
seeded PRNG so everyone in the room sees the same landscape. It replaced a
flat brown disc and a flat green ring, which read as cardboard.

Indoor lighting is one point light per visible fixture rather than a single
bright one covering a room. The classroom previously had one lamp at twice
the intensity between its two fixtures, plus a "sunlight through the window
wall" light sitting 1.2m off that wall — with inverse-square falloff the
plaster beside it took the full brightness and blew out to white. The glow
light now sits further into the room and dimmer, so the windows still wash
the floor warm without clipping anything near them.

### What an avatar is on the wire

The protocol's `avatarUrl` field holds one of two things:

- a same-origin path or `https://` URL to a `.vrm` file, or
- `seiza-avatar:v1:<base64url JSON>`, a designer avatar's settings.

The room server (`sanitizeAssetUrl` in `worker/room.ts`) accepts only those
shapes, capped in size. Every receiver re-validates each designer field with
`sanitizeAvatarSpec`, so a malformed payload renders as the default look.
`src/avatar/designer/buildDesignerVrm.ts` turns the settings into a genuine
three-vrm `VRM` object with a humanoid rig, so designer avatars go through
exactly the same animation path as uploaded files.

### Orientation

VRM 0.x models face -Z and VRM 1.0 models face +Z. `VrmAvatar.tsx` gives
VRM 1.0 models, including designer avatars, an extra half turn, so every
avatar faces -Z at rotation 0, the same way the camera looks by default.
Without that, VRM 1.0 uploads walked backwards.

### Animation pipeline

`src/avatar/AvatarAnimator.tsx` runs one Three.js animation mixer per
avatar, in three layers.

- Idle, walk, and run are each split into upper- and lower-body halves.
  Their weights follow ground speed, and walk and run share one phase so
  feet don't slide when they crossfade.
- A posture — currently sitting — is a held full-body pose that owns the
  legs until it's released.
- A gesture layers on top. An upper-body gesture takes over the upper half
  only, so you can wave while walking or while seated. A full-body gesture
  takes over both. A gesture marked `hold` clamps on its final frame and
  stays there until released, instead of playing once.
- Weights for every bone always add up to one. The VRM rest pose is a
  T-pose by specification, so any gap in the blend would show as arms
  snapping out. That was the cause of the old in-world T-pose.
- It runs before `vrm.update()` each frame. Spring bones (hair, skirts) get
  a capped time step and are reset after teleports, which is what stops
  hair from flying away.

**Resting poses are settled onto the world at runtime, not baked.** A
`.vrma` clip can only carry one hip height. VRM playback scales that
translation by each avatar's own hips height, but leg length varies
independently of it — two avatars with the same hips height can have very
different shins — so a kneeling pose that sits perfectly on the skeleton it
was authored against hovers above the tatami on one upload and sinks through
it on the next. No amount of re-authoring fixes that for every body.

So a clip declares what it rests on (`ground: "floor" | "seat"` in the
generator and the manifest), and a second frame pass in `AvatarAnimator`,
running after `vrm.update()`, measures where the posed skeleton's contact
points actually ended up and slides the model until they're where they
belong: the lowest of shins/feet/toes onto the floor for seiza, the hips up
to the seat height for sitting. The measurement already includes the offset
applied last frame, which makes it a plain feedback loop — correct by the
error, smooth it, repeat — that settles in a few frames and then holds
still. Clearances (a shin's thickness, the drop from hip joint to cushion)
scale with the body, so they mean the same thing on a 1.4m avatar and a
1.8m one.

Verified on four real `.vrm` files including a VRoid Hub download and a VRM
1.0 sample: every one lands its contact point within a centimetre of where
it should be, with a per-avatar correction between 4cm and 10cm — which is
exactly the floating the baked heights had been producing.

Remote players are eased toward their latest network position
(`src/multiplayer/RemotePlayers.tsx`) rather than jumping five times a
second. That gives their animator a believable speed and keeps their hair
calm.

### Regenerating the built-in clips

```bash
npm run generate:motions
```

`scripts/generate-motions.mjs` writes `public/animations/*.vrma`,
`public/gestures/builtin/*.vrma`, and the manifest
`src/avatar/builtinMotions.generated.ts`. Keyframes are authored as Euler
angles in the VRM 1.0 normalized humanoid space: the avatar faces +Z with
its left side toward +X, and rotation order is XZY. `@pixiv/three-vrm-animation`
converts the clips for VRM 0.x models at load time. Use the T-pose button in
any avatar preview to check a model's rig before blaming a clip.

Two flags in that script shape how a clip is used. `hold` means the clip ends
on the pose it should keep, rather than returning to a relaxed stance — the
raised hand, seiza and sitting all do. A `hold` clip that is also `fullBody`
becomes a posture, toggled by its key instead of held down. `hidden` keeps a
clip out of the menu and off the number keys because something else triggers
it, which is how `sit` stays out of the gesture list while chairs still use
it.

**Hands are the hard part, so they're measured, not guessed.** Where a palm
ends up pointing depends on the shoulder, both arm bones and the forearm roll
together, and getting it wrong is what turns a gasshō into a dab. The angles
in the generator were solved in Node by building an avatar, playing a
candidate pose, measuring in world space where each hand landed and which way
its palm faced, and scoring that against what the pose should be.

Two things about that harness are worth knowing, because both were learned
the hard way:

- **It solves against several bodies at once**, not one. Rotations retarget
  cleanly between rigs; absolute heights do not. A pose solved to put the
  hands at "y = 1.06" on one avatar put them at the belly of a shorter one.
  Every target is therefore expressed against that body's own landmarks —
  its sternum, its thigh line, its shoulder width — and a solution has to
  work on all of them.
- **VRM 0.x rigs face the other way.** three-vrm's animation importer
  mirrors a clip onto them by negating the quaternion's x and z. Anything
  that poses a rig directly has to do the same, or half the test avatars
  quietly produce mirrored nonsense — in one run, arms above the head in a
  pose that should have had the hands resting on the thighs.

- **The contact point is the palm, not the wrist.** Scoring the wrist joint
  against the thigh looked right numerically and wrong on screen: the wrist
  sits a whole hand's length short of where the hand actually touches, so
  "wrist 4cm above the thigh axis" meant the palm was *inside* the leg.
  Measuring at the middle-finger knuckle instead, and adding the wrist
  angles to the solve — forearm roll alone can't lay a palm flat without
  dragging the hand off the leg — took the palm from 46% of the way to
  facing down to 83%, on every rig.

The same harness re-checks every clip afterwards, on each rig, through the
real playback path: hands meeting at the sternum for gasshō, a clap that
actually closes, palms up and elbows in for a shrug, palms resting flat on
the thigh line (and not inboard or outboard of it) for seiza and sitting,
and a seated backside that clears the chair cushion.

Clip URLs in the generated manifest carry a `?v=` content hash. Regenerating
a motion rewrites the file but not its path, so without that a browser keeps
serving the bytes it already had — which is indistinguishable from the fix
not working.

### Custom gestures

Add clips under `public/gestures/custom/` and list them in `world.json`:

```json
"customGestures": [
  { "name": "salute", "label": "Salute", "url": "/gestures/custom/salute.vrma" },
  { "name": "bow", "label": "Deep bow", "url": "/gestures/custom/deep-bow.vrma" }
]
```

A custom gesture with a built-in's name replaces that built-in. Any other
name is added alongside. The gesture menu lists built-in and custom
gestures separately. Details and authoring tips are in
`public/gestures/README.md`.

### Gesture sync

A client sends only a gesture name. The server checks the name's shape,
throttles each connection to one gesture per 250 ms, and increments that
player's `gestureSeq`. Clients start a clip only when the sequence number
changes. Repeating a gesture therefore replays it, and a player who joins
mid-gesture doesn't see a stale one start. A name that a client's
`world.json` doesn't define is ignored.

Sitting is a separate `posture` field on each player rather than a gesture,
for one concrete reason: a gesture ends, and a posture has to outlast it.
When it was a gesture, a seated player who waved stood up on every other
screen as soon as the wave finished.

### Local profile storage

`src/profile/profileStore.ts` stores the display name, avatar choice, and
any uploaded `.vrm` file in IndexedDB, keyed by world id. Cookies were
ruled out because they hold about 4 KB and are sent with every request.
Every call fails soft, so blocked storage or private browsing just means
nothing is remembered. Unticking "Remember" on the join screen deletes the
stored profile.

## Project layout

```
src/            frontend (React Three Fiber + WebXR + VRM)
  avatar/       VRM loading, orientation, animation mixer, gesture registry
    designer/   built-in avatar designer: settings model, VRM builder, UI
  player/       local movement, camera, sitting, touch controls, VR locomotion
  multiplayer/  realtime client, remote-player rendering, protocol types
  profile/      remembered name/avatar in IndexedDB
  voice/        WebRTC voice mesh, signaled through the room server
  edit/         in-world object placement/move/delete UI, image compression
  nav/          runtime navmesh for click-to-move
  scene/        built-in world: floor plan (layout.ts), canvas-drawn
                materials, lighting, the procedural exterior (Outdoors.tsx),
                shared furniture (Chair/SeatPad) + deployer scene.glb overlay
  ui/           join screen, avatar chooser and preview, HUD, shared motion
  interactions/ gesture menu and practice mode (pedagogical modules)
worker/         Cloudflare Worker: static hosting, avatar upload API (KV),
                and the realtime room server (room.ts, a Durable Object)
public/worlds/  per-deployment world configs — the customization surface
public/animations/, public/gestures/
                built-in motion clips (generated) and custom gesture clips
scripts/        motion clip generator, KV setup, optional asset fetching
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
  permissions: a cap on total placed objects, per-connection throttles on
  chat, gestures, and avatar changes, and asset URLs restricted to
  same-origin paths, http(s), or well-formed designer settings (see
  `worker/room.ts`).
- **Avatar-upload rate limiting is best-effort.** `worker/index.ts` uses
  a per-isolate in-memory counter, not Cloudflare's real Rate Limiting
  rules — adequate for low-traffic self-hosted use, not for a deployment
  that expects meaningful public load.
- **Multiplayer sync is untested at scale.** Works correctly in small
  local testing; no load testing has been done against `maxOccupants`-
  sized rooms.
- **Physics is a clamp and a box list, not a simulation.** Players are kept
  inside the room rectangles and pushed out of the built-in furniture, which
  covers walls, benches, desks and the like. Objects placed through the
  editor are not in that list, so you can still walk through those, and
  nothing stacks, falls or collides with anything else. Placed objects don't
  fall, roll, or collide — there's no rigid-body simulation. VRM's own
  spring-bone physics (hair/skirt secondary motion) is real and does run
  via `vrm.update()`, so avatars aren't *entirely* without physics. A
  real object physics layer (e.g.
  [@react-three/rapier](https://github.com/pmndrs/react-three-rapier))
  is a large enough addition — new dependency, collision authoring for
  BaseEnvironment, network sync implications — that it's future work to
  scope deliberately, not something to bolt on inline.
- **Built-in motions are hand-keyed, not motion capture.** They are kept
  simple so they can live as readable code under the repository license.
  Any gesture can be replaced with a richer `.vrma` clip through
  `world.json`. Idle, walk, and run can't be swapped through config yet;
  a fork can replace the files in `public/animations/`.
- **Designer avatars are stylized.** They are built from simple shapes and
  have no facial expressions, blinking, lip sync, or hair physics. Upload a
  VRM for those.
- **Chat has no history.** Room text chat is relay-only, not persisted —
  reconnecting or a new joiner starts with an empty chat panel.
- **Avatar optimization is texture-only, by design.** It resizes/re-encodes
  oversized textures via glTF-Transform, but deliberately never touches
  mesh/node/accessor structure, because no VRM extension package exists
  for glTF-Transform to safely reason about humanoid bone references or
  blend shapes during structural transforms — see the reasoning in
  `src/avatar/optimizeVrm.ts`.
- **Click-to-move routes around obstacles, but nothing else collides.**
  A navmesh is generated at runtime from whatever environment geometry is
  actually in the scene — procedural `BaseEnvironment` or an uploaded
  glTF world — via
  [recast-navigation](https://github.com/isaac-mason/recast-navigation-js)
  (WASM Recast/Detour), so tap/click-to-move paths around walls and
  pillars instead of walking into them. Generation is at runtime rather
  than from a pre-baked navmesh file because the default room is
  generated in code and an editor can swap the whole environment live —
  there's no authoring step where a navmesh could have been baked. It is
  strictly additive: if the WASM module fails to load, generation fails,
  or no route exists, movement falls back to the previous straight-line
  walk. **WASD/D-pad movement still has no collision** — only a radius
  clamp — so direct input can still walk through a wall. Rigid-body
  physics for placed objects is still absent.
