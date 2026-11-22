# Seiza architecture

This guide is for people who want to change Seiza's code. It explains how
the code is divided, the rules each part follows, and where to start for
common changes. For what each feature does, see the
[How it works](DOCS.md#how-it-works) section of DOCS.md. This guide links to
it instead of repeating it.

## Contents

- [The parts](#the-parts)
- [Design rules](#design-rules)
- [Module map](#module-map)
- [The frame](#the-frame)
- [Avatars](#avatars)
- [Bone math](#bone-math)
- [Gestures](#gestures)
- [Sky, weather, and seasons](#sky-weather-and-seasons)
- [Multiplayer](#multiplayer)
- [The scene](#the-scene)
- [VR and phone viewers](#vr-and-phone-viewers)
- [Worlds](#worlds)
- [Checking your change](#checking-your-change)
- [Where to start](#where-to-start)

## The parts

Seiza has three parts:

| Part | What it is | Where |
|---|---|---|
| **Client** | A React app that draws the world with three.js through React Three Fiber, and avatars with three-vrm. | `src/` |
| **Room server** | A Cloudflare Worker. Each room is one Durable Object that holds the room's state and relays messages between the people in it. | `worker/` |
| **Worlds** | Folders that each configure a deployment: its settings, media, and optional world code. | `public/worlds/default/`, `worlds/<id>/` |

Every world runs the same client and the same server. A world changes
what's in the room, not how the room works.

```
 browser (src/)                         Cloudflare (worker/)
 ┌───────────────────────────────┐      ┌──────────────────────────────┐
 │ App.tsx                        │ WS  │ index.ts: assets, uploads,   │
 │  ├─ Scene (built-in rooms or   │◄───►│   TURN credentials, /rooms/  │
 │  │   a world's model)          │     │ room.ts: one SeizaRoom per   │
 │  ├─ PlayerRig (you)            │     │   room (state, validation,   │
 │  ├─ RemotePlayers (everyone    │     │   relay, rate limits)        │
 │  │   else)                     │     └──────────────────────────────┘
 │  ├─ WorldExtension (a world's  │
 │  │   own code, loaded on       │      Voice and video go peer to peer
 │  │   demand)                   │      (WebRTC), through TURN when a
 │  └─ HUD (flat UI, XR HUD)      │      network needs it.
 └───────────────────────────────┘
```

## Design rules

These rules explain most of the code's shape. Keep to them when you add
something.

### Compute shared things; don't send them

When every visitor can work something out from the same inputs, nobody sends
it. The inputs are usually the wall clock, the date, a seed, or the room's
settings.

| What everyone sees alike | How it's worked out | Where |
|---|---|---|
| Weather, when it follows the schedule | A hash of the 3-hour block, with odds by month | `scheduledWeather` in `src/sky/weather.ts` |
| Lightning strikes and their thunder | A hash of each 1-second slot | `src/sky/lightning.ts` |
| The season | The date, or the room's choice | `src/sky/seasons.ts` |
| Stars, the treeline, hills | Fixed seeds | `SunsetSky.tsx`, `Outdoors.tsx` |
| Where a guide walks | The wall clock | `src/guides/Guide.tsx` |
| Seiza endurance (dozing, numb legs) | Each client times each avatar from when it saw them kneel | `src/avatar/seizaEndurance.ts` |

What can't be worked out goes through the room server: positions, gestures,
placed objects, and the room's sky settings.

### The server validates; clients sanitize what they receive

The room server checks every message's shape, size, and rate before it
stores or relays it. Clients check again before they use anything another
client sent, so a hostile or broken value turns into a default instead of
an error. Two examples:

- A designer avatar spec is decoded with `sanitizeAvatarSpec`.
- A tracked VR pose is checked with `sanitizeTrackedPose` on the server.

### Per-frame state lives outside React

Values that change every frame live in module state, not React state, so
reading them never re-renders the scene:

- `skyState` holds the sky, weather, season, and lightning flash.
- `trackingStore` holds VR body poses.

React stores built on `useSyncExternalStore` are for things the UI shows
and that change rarely: the language, together-gesture requests, guide
conversations, and the comfort setting.

### One source of truth for each kind of fact

| Facts | The one place they live |
|---|---|
| Where the built-in rooms, seats, obstacles, and floors are | `src/scene/layout.ts` |
| What the client and server say to each other | `src/multiplayer/types.ts` |
| Which gestures exist and how they behave | `src/avatar/gestures.ts` and `builtinMotions.generated.ts` |
| The VR pose wire format | `src/xr/body/trackingWire.ts` |

Rendering and collision both read `layout.ts`, so a bench is never solid
in one place and drawn in another. The server and the client both import
`types.ts`, so a protocol change can't reach only one of them.

### Every effect has a budget

Seiza must run on phones and on a Quest 2 with a full room. Before you add
anything that draws, decide what it costs:

- **Light.** At most four real point lights shine at once (`LightPool.tsx`).
  Glow strips, under-glow, and wall washes are drawn as unlit textures that
  look like light (`GlowEdges.tsx`, `UnderGlow.tsx`).
- **Draw calls.** Repeated things are instanced (the treeline, ceiling
  lights). A designed avatar's parts are merged into one mesh per color.
- **Work per frame.** Distance checks are throttled to a few times a
  second. Shadows redraw on a slow heartbeat, not every frame.
- **Nothing when it's off.** Rain draws nothing while it's dry. A season's
  effects aren't mounted when there's no season.

See [Performance](DOCS.md#performance) for measured costs.

### The base stays world-neutral

Code under `src/` doesn't know about any one world. A world adds what it
needs through the [world extension hook](#worlds). If a world needs
something the hook doesn't offer, add a general hook to `WorldSceneProps`
instead of a special case in the base.

### Text comes in both languages

Every string a visitor reads is written as `L("English", "日本語")` from
`src/i18n/lang.ts`. A component that shows text calls `useLang()` once so it
redraws when the language changes.

## Module map

| Folder | What it does | Start with |
|---|---|---|
| `src/avatar/` | Loading, drawing, and animating avatars | `useVrmLoader.ts`, `VrmAvatar.tsx`, `AvatarAnimator.tsx` |
| `src/avatar/designer/` | Avatars built in code from a small spec | `avatarSpec.ts`, `buildDesignerVrm.ts` |
| `src/avatar/import/` | Converting a GLB avatar (from Avaturn) to VRM | `glbToVrm.ts` |
| `src/player/` | Your own movement, camera, seats, and the VR origin | `PlayerRig.tsx` |
| `src/multiplayer/` | The socket, remote avatars, and their smoothing | `useRoomSocket.ts`, `RemotePlayers.tsx`, `remoteMotion.ts` |
| `src/interactions/` | The gesture menu and together gestures | `GesturePanel.tsx`, `together.ts` |
| `src/scene/` | The built-in rooms, outdoors, lighting, rain, and seasons | `Scene.tsx`, `layout.ts` |
| `src/sky/` | Time, sun, moon, weather, lightning, seasons | `weather.ts`, `skyState.ts` |
| `src/xr/` | Headsets and phone viewers: body tracking, the wrist menu, gaze, comfort | `body/`, `hud/`, `viewer.ts` |
| `src/nav/` | Walking on a world's own model, by navigation mesh | `navGround.ts` |
| `src/guides/` | Guides who walk the world and answer questions | `brain.ts`, `Guide.tsx` |
| `src/edit/` | Edit Mode: placed objects and the sky controls | `WorldObjects.tsx`, `SkyControls.tsx` |
| `src/media/` | Voice, camera, and screen sharing | `useRealtimeMedia.ts`, `VideoPanel.tsx` |
| `src/audio/` | World sounds, all synthesized | `sfx.ts` |
| `src/worlds/` | The world extension hook and portals | `WorldExtension.tsx` |
| `src/i18n/` | English and Japanese | `lang.ts` |
| `worker/` | The Worker and the room server | `index.ts`, `room.ts` |
| `scripts/` | Build helpers and the gesture generator | `generate-motions.mjs` |

## The frame

Everything that moves runs in React Three Fiber's frame loop. Code that
poses avatars depends on running in this order, set by `useFrame`
priorities:

| Priority | Code | What it does |
|---|---|---|
| -1 | `AvatarAnimator` (pose pass) | Mixes locomotion, posture, and gesture clips onto the normalized bones, then adds gaze and doze offsets. |
| -1 | `AvatarAnimator` (ground pass) | Settles resting poses onto the floor, seat, or bed, from last frame's skeleton. |
| -0.9 | `XrBodyTracker` | Reads your headset and controllers into a tracked pose. |
| -0.5 | `TrackedBody` | Puts tracked poses onto avatars: head, arms, fingers, crouch. |
| 0 | `VrmAvatar` | `vrm.update()`: copies the normalized pose to the visible skeleton and steps spring bones. |
| 0 | Everything else | The sky, rain, lights, guides, and world code. |

Don't give a `useFrame` a priority above 0. React Three Fiber treats that
as "I render the frame myself", and the canvas stops drawing.

## Avatars

### Where an avatar comes from

An avatar is always a URL, so the network protocol has one avatar field:

| URL | Source | Built by |
|---|---|---|
| `/api/avatars/<id>.vrm` | An upload, optimized in the browser first (`optimizeVrm.ts`) | three-vrm's loader |
| A path in `world.json` | A deployment's preset | three-vrm's loader |
| `seiza-avatar:v1:<base64url JSON>` | The designer | `buildDesignerVrm.ts`, on every client |

`useVrmLoader.ts` turns any of these into a three-vrm `VRM` object.
Everything after that, from animation to tracking, works on the `VRM` and
doesn't know which kind it has.

### Orientation

VRM 0.x models face -Z and VRM 1.0 models face +Z. `VrmAvatar.tsx` gives
VRM 1.0 models a half turn so every avatar faces -Z at rotation 0. Code that
needs an avatar's facing reads it from the skeleton instead of assuming one
(see [Bone math](#bone-math)).

### Designed avatars

A designed avatar is a spec of a few hundred bytes, not a file. Every
client builds the same body from it:

1. **Skeleton.** A VRM humanoid skeleton, scaled by the spec's height and
   build (`skeleton()` in `buildDesignerVrm.ts`).
2. **Swept surfaces.** The torso, arms, legs, hands, and shoes are each
   one surface swept along the bones. Each ring of vertices is weighted
   between the bones on either side of the nearest joint, so an elbow bends
   as one surface (`sweepGeometry` and `chainWeights` in `designerBody.ts`).
   Clothing is the same sweep pushed out a few millimeters, with the same
   weights, so it follows every bend.
3. **Hair.** Tapered locks swept along curves over the scalp
   (`designerHair.ts`).
4. **Panels.** Flat pieces laid on the torso front, such as lapels, a tie,
   and a pocket (`torsoPanel` in `designerMesh.ts`).
5. **Face.** Eyes, brows, and mouth are painted with Canvas 2D onto patches
   that follow the head's curve (`designerFace.ts`). The expression system
   moves those patches (`designerExpressions.ts`).
6. **Merge and outline.** Every part of one color is merged into one
   skinned mesh. Each mesh gets an outline: the same mesh drawn inside out
   and pushed out along its normals, in a dark shade of its color
   (`designerMesh.ts`). A designed avatar is 26 to 34 meshes, including
   outlines and the 7 painted face patches.

A rigid part, such as a button, is weighted wholly to one bone, so it moves
exactly as if it were attached to that bone. Hiding your own head in first
person shrinks the head bone, which hides everything weighted to it.

## Bone math

### The normalized humanoid

three-vrm gives every avatar a **normalized** skeleton next to its real one:

- Every normalized bone's rest rotation is the identity, in the model's
  own space.
- The rest pose is a T-pose.

All of Seiza's posing writes to normalized bones: clips, gaze, tracking,
and the grounding pass. `vrm.update()` then copies the result onto the
model's real bones, whatever their own orientations. That's why one clip
works on every avatar.

### Writing rotations for clips

The gesture generator (`scripts/generate-motions.mjs`) writes keyframes in
VRM 1.0 space:

- The avatar faces +Z, its left is +X, and +Y is up.
- Angles are Euler angles in **XZY** order.
- The file's header lists what each axis does on each bone. For example,
  -Z on the left upper arm lowers it.

To mirror a pose from left to right, negate Y and Z and leave X alone.
Write a symmetric pose once, for the left side, and derive the right with
the generator's `mirror()`.

### VRM 0.x and 1.0

The two versions face opposite ways. three-vrm's animation importer mirrors
a clip onto a VRM 0.x rig by negating the quaternion's x and z. If your code
poses bones directly, do one of two things:

- Read directions from the skeleton's rest positions, as `bodyIk.ts` does.
  This is the preferred way, because it works on any rig.
- Mirror your rotations the same way the importer does.

### Layers and weights

`AvatarAnimator.tsx` splits every clip into upper-body and lower-body halves
(`LOWER_BODY_BONES`). Locomotion, posture, and gesture layers each claim
halves, so you can wave while walking or seated.

**For every bone, the layer weights must add up to one.** The rest pose is
a T-pose, so any gap in the blend snaps the arms out.

After the mixer, small offsets are added to the spine, chest, neck, and head
for gaze, dozing, and trembling. Each bone's pose from before the offsets is
recorded, so the offsets never pile up from frame to frame.

### Grounding

A clip stores one hip height, but leg lengths vary. Resting poses declare
what they rest on (`ground: "floor" | "seat" | "body"`). The ground pass
measures where the posed skeleton's contact points ended up and moves the
model until they're in place. It's a feedback loop that settles in a few
frames. See [Grounding resting poses](DOCS.md#grounding-resting-poses).

### Tracked bodies (inverse kinematics)

Inverse kinematics (IK) is used only for VR body tracking. There, the pose
comes from a headset 10 times a second, and each client solves it locally.

- **Wire format.** Head and hand poses are sent relative to the player's
  feet and facing, and divided by their standing eye height. A receiver
  multiplies back by the avatar's eye height, so a tall player's reach lands
  right on a small avatar (`trackingWire.ts`).
- **Arms and legs.** Each limb is a two-bone chain solved with the law of
  cosines. A pole point picks which way the elbow or knee bends
  (`solveTwoBone` in `bodyIk.ts`).
- **Crouching.** The hips drop by how far the head is below its standing
  height. Height is measured from the neck pivot, not the eyes, so looking
  down doesn't count as crouching. Small drops are ignored.
- **Overlay.** Tracking writes through a `PoseOverlay`, which records each
  bone's animated pose before writing and restores it next frame. Tracking
  can then fade in and out over the animation without either one owning
  the bones. Tracking and the room modes share one overlay per avatar
  (`sharedOverlay`), restored once a frame before any of them writes: with
  one each, the second to write recorded the first's pose as the animated
  one, and a hand posed by Band or Fantasy stayed posed after both stopped.

Gestures, including together gestures, are clips, not IK. Every client
plays the same clip from the same name, so a gesture needs no per-frame
coordination between clients.

### Arm length

Together gestures place two avatars at a measured distance apart. That
distance is scaled by both avatars' arm lengths, read from their rest
skeletons (`avatarReach.ts`), so hands meet on short-armed and long-armed
avatars alike.

## Gestures

| Step | Where |
|---|---|
| Clips are authored as code | `scripts/generate-motions.mjs` writes `.vrma` files and the manifest `builtinMotions.generated.ts` |
| A deployment adds or replaces clips | `customGestures` in `world.json` |
| The registry merges both | `src/avatar/gestures.ts` |
| A player asks for one | `GesturePanel.tsx`, number keys, or the wrist menu |
| The server relays its name | `worker/room.ts` (rate limit, `gestureSeq`) |
| Every client plays it | `AvatarAnimator.tsx` |

A gesture's flags (`hold`, `fullBody`, `hidden`, `loop`, `ground`,
`expression`) decide how it plays. See [Gestures](DOCS.md#gestures).

**Postures** (sitting, seiza, a dance) are a separate `posture` field on
each player, because a gesture ends and a posture lasts.

**Together gestures** need both people's consent. The server enforces it:
it grants each partner one play of that gesture after a yes, and refuses the
gesture without that grant. See [Together gestures](DOCS.md#together-gestures).

To add a built-in gesture:

1. Add its keyframes to `scripts/generate-motions.mjs`.
2. Run `npm run generate:motions`.
3. Check it in an avatar preview on a VRM 0.x and a VRM 1.0 avatar.

## Sky, weather, and seasons

The sky runs as one pipeline. Pure functions at the start, one clock in the
middle, and readers at the end:

```
weather.ts (pure)          skyState.ts                     readers
 sun, moon, irradiance  →   SkyClock decides the time,  →   SkyDriver: lights, fog
 WeatherState               weather, and season, and        SunsetSky: sky dome, stars,
 scheduledWeather           writes skyState                   clouds, lightning glow
lightning.ts (pure)                                         Outdoors: ground and trees
seasons.ts (pure)                                           Rain: rain, snow, splashes,
                                                              rain sound, lightning
                                                            Seasons: the tree, falling
                                                              petals, cicadas
                                                            world code (Seizora's plant)
```

`SkyClock` takes the time and weather from the first of these that is set:

1. A preview in the page's URL (`?skyHour=`, `?skyWeather=`, `?skyDate=`,
   `?skyScale=`, `?skySeason=`).
2. The room's sky, set in Edit Mode and stored by the room server
   (`RoomSky` in `types.ts`, checked by `sanitizeRoomSky` in `room.ts`).
3. The world's `sky` settings in `world.json`.

Two separations matter:

- **Decoration doesn't feed simulation.** Seasons only change what you see
  and hear. The weather engine, and the energy numbers worlds compute from
  it, keep following the Philippines.
- **Pure functions hold the logic.** `weather.ts`, `lightning.ts`, and
  `seasons.ts` have no three.js scene code and are covered by unit tests.
  Readers only draw.

To add a weather type:

1. Add it to `WEATHER` in `weather.ts`, with its cloud, wind, rain, and
   labels.
2. Add it to `ROOM_SKY_WEATHER` in `types.ts`, so rooms can pick it.
3. Decide whether `scheduledWeather` should ever choose it.
4. Add test cases in `weather.test.ts`.

## Multiplayer

The protocol is two TypeScript unions in `src/multiplayer/types.ts`:
`ClientMessage` and `ServerMessage`. The room server (`worker/room.ts`)
handles each client message in one `switch`. For each one, it:

- checks the sender is allowed (joined, editor, or admin),
- checks every field's shape and size,
- applies a per-connection rate limit where a message is broadcast,
- updates its state, and stores lasting state in Durable Object storage,
- broadcasts the result.

Remote avatars move smoothly between position updates, which arrive about
five times a second (`remoteMotion.ts`). Detail drops for avatars that are
far away or out of view (`avatarDetail.ts`).

To add a message:

1. Add it to `ClientMessage` and `ServerMessage` in `types.ts`.
2. Handle and validate it in `room.ts`.
3. Send and receive it in `useRoomSocket.ts`.
4. Add a test to `tests/room.test.ts`.

A world's own shared settings don't need a new message. Use `worldState`
through the world extension hook.

## The scene

### Layout and collision

`src/scene/layout.ts` describes the built-in world: rooms, seats, obstacles,
floor heights (`floorHeightAt`), and where rain can't reach (`sheltered`).
Collision pushes a walker out of four lists of boxes:

| List | Contents | Set by |
|---|---|---|
| Active | The built-in rooms' furniture | `layout.ts` |
| World | A world's own exhibits | `setWorldObstacles`, from world code |
| Scenery | Things that come and go with settings, such as the seasonal tree | `setSceneryObstacles` |
| Placed | Tables people placed in Edit Mode | `setPlacedObstacles` |

A world made of its own model replaces all of this with a `Ground`, backed
by a navigation mesh (`src/nav/navGround.ts`). Code asks the same questions
of either: where the floor is, whether a spot is walkable, and whether it's
under cover.

### Where the viewer is

Use `viewerPosition(camera, out)` from `src/xr/viewer.ts` for anything that
depends on where the viewer stands. Examples are sounds by distance,
avatars and videos by range, rain around you, and the sky dome. In a
headset, `camera.position` is only the head's offset inside the play area,
not its place in the world.

### Lights

| Kind | Cost | Use it for |
|---|---|---|
| Pooled point light (`PooledLight`, `LightPool.tsx`) | One of 4 real lights | Lamps that light the room and the avatars |
| Fake light (`GlowEdges.tsx`, `UnderGlow.tsx`) | A textured strip; no light cost | Glowing edges, under-desk light, wall washes |
| Light switch (`LightSwitch.tsx`, `roomLights.ts`) | Nothing per frame | Turning a zone's lights on and off for everyone |

## VR and phone viewers

- **Movement.** `PlayerRig.tsx` moves the XR origin, not the camera. It
  reads the head with `readXrHead`, resolves collisions against the head's
  position, and moves the origin by the correction. So walking around your
  real room still collides with benches.
- **The wrist menu.** `src/xr/hud/` draws a menu from a plain data model
  (`XrHudModel`) that `App.tsx` builds. The HUD knows nothing about rooms or
  media. Phone viewers select by gaze (`gaze.ts`).
- **Comfort.** `ComfortVignette.tsx` darkens the edges of the view during
  thumbstick movement.
- **Body tracking.** See [Tracked bodies](#tracked-bodies-inverse-kinematics).
- **Frame rate.** Sessions ask for 72 Hz where the headset offers it.

To test without a headset, open `http://localhost:5173/?xrEmulate=gaze` in
a browser without WebXR. A built-in emulator stands in for a phone viewer.

## Worlds

A world is a folder:

```
worlds/<id>/
  world/world.json      settings, spawn point, gestures, portals, sky
  world/…               media and models
  client/index.tsx      optional world code, exporting a Scene component
  build.mjs             builds the client for this world into dist/
  wrangler.jsonc        this world's own Worker
  README.md             what's in the world and how to deploy it
```

World code is loaded on demand, only in that world, inside an error boundary,
so a failure in it leaves the rest of Seiza running. It receives
`WorldSceneProps` (`src/worlds/WorldExtension.tsx`), which include:

- the room's objects, sky, and light switches,
- shared `worldState` that the room server stores,
- the players, and ways to play gestures, warp, and turn this visitor,
- private messages between visitors, and a per-viewer filter for who you
  see and hear,
- a card in the HUD (`showWorldOverlay`) and paths for guides (`findPath`),
- seats of its own (`sit`, with `SeatPad`), and solid furniture
  (`setWorldObstacles`).

Guides answer only from text the world's authors wrote, by retrieval
(`src/guides/brain.ts`). There's no language model, so a guide can't make up
an answer.

See [World code](DOCS.md#world-code) for the full interface and an example.

## Checking your change

| Check | Command or tool |
|---|---|
| Types | `npm run typecheck` |
| Unit and server tests | `npm test` (Vitest; tests sit next to their module as `*.test.ts`, server tests in `tests/`) |
| The app, locally | `npm run dev` with `npm run worker:dev` in a second terminal |
| A headset, without one | `?xrEmulate=gaze` on localhost |
| A time, weather, or season | `?skyHour=18`, `?skyWeather=typhoon`, `?skySeason=winter` |
| Seiza endurance, sped up | `?seizaSpeed=30` |
| An avatar's rig | The **T-pose** button in any avatar preview |

## Where to start

| You want to | Start here |
|---|---|
| Add or change a gesture | `scripts/generate-motions.mjs`, then [Gestures](#gestures) |
| Change how avatars move | `src/avatar/AvatarAnimator.tsx` |
| Change the designer's look | `src/avatar/designer/buildDesignerVrm.ts` |
| Add a designer option | `avatarSpec.ts` (spec, presets, `sanitizeAvatarSpec`), then the builder and `AvatarDesigner.tsx` |
| Change the sky or weather | `src/sky/weather.ts` and `skyState.ts` |
| Add something to the built-in world | `src/scene/layout.ts` for where it is, then a component in `src/scene/` |
| Add a protocol message | [Multiplayer](#multiplayer) |
| Build a new world | Copy a world folder under `worlds/` and read [Worlds](#worlds) |
| Change VR behavior | `src/player/PlayerRig.tsx` and `src/xr/` |
