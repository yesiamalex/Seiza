# ISCOLab

**ISCOLab** is a Seiza world made of a model of the lab: walk its rooms
with others, talk, share screens, and meet, from a browser or a headset.
Like SeiOU, it doesn't use Seiza's built-in rooms: the model is the whole
world (`"environment": "model"` in `world/world.json`; see DOCS.md, "A world
made of its own model").

## What's in it

- **The lab:** the floor plan from `media-src/ISCOLab.glb`, about 32 by
  17 m, with its walls at a storey's height (3.2 m). It's a blockout: plain
  walls and floor, two colors, no ceiling, so the sky shows overhead.
- **A meadow,** the lab at its west edge and open ground east of it, out
  to the kubo.
- **Under construction, for now.** The lab is being fixed, so sessions
  are in the kubo; the barrier is for the look: posts, caution tape, and
  striped barricades with amber lamps that blink (brighter after dark),
  cones, scaffolding up part of its front, and a sign in English,
  Japanese, and Filipino pointing people to the kubo. The lab is still
  open: the barrier leaves a way in at the main door, cones either side,
  and the navmesh walks round the rest of it as a wall.
- **The kubo,** across the meadow, for sessions meanwhile: Tulay's kubo
  hall (built with Tulay's own geometry and materials), open on its west
  side toward the lab, with sawali knee walls, a nipa roof, capiz lamps lit
  at dusk, a name board, a facilitator's table, and bamboo benches in
  three rows you can sit on, facing a screen on its east wall.
- **Arrival** is on the meadow between the two, facing the kubo.
- **Walking** follows a navmesh baked from the model and the plan: round
  the barrier and in at its opening, across the meadow, into the kubo.
- **The screen,** the facilitator's chair, and a welcome board in English
  and Japanese are the room's starting objects (`defaultObjects` in
  `world/world.json`), so they can be shared to, moved, or removed. A room
  only starts with them when it has no objects yet: a room that already
  has the lab's old tables and screen keeps them, inside the lab,
  until an editor deletes them (in Edit mode) and puts a screen in the
  kubo, or the room is emptied.
- Everything else Seiza has: voice, chat, screens, boards, avatars,
  gestures, the shared sky and weather, VR and phones.

## When the lab opens again

Set `UNDER_CONSTRUCTION` to `false` in `client/plan.ts` and re-run the
bake (below): the barrier, the scaffolding, and the sign go, and the
navmesh opens the lab again. The kubo stays until you take it out of
`client/index.tsx`. Move the starting objects back into the lab in
`world/world.json` if sessions go back in there.

## Where things are

`client/plan.ts` is the one place: the meadow, the barrier, the sign, the
scaffolding, the kubo, its benches and screen, and the arrival point. The
world's code builds from it, and the bake reads the same file (Node runs
its TypeScript as it is), so the navmesh and what's drawn can't disagree.
`client/plan.test.ts` checks the arrival point reaches the kubo and the lab
(through the barrier's opening), and that the starting objects are in the
kubo.

## Update the model

The original model isn't committed (`worlds/*/media-src/` is ignored). Put
it at `worlds/iscolab/media-src/ISCOLab.glb`, then:

```bash
node worlds/iscolab/scripts/build-lab.mjs
```

It writes `world/models/lab.glb` and `lab.navmesh` (both committed), and
prints the doorways it found, how much of the lab's floor can be walked to
from its front door, and whether the kubo can be walked to from the
arrival point and the lab can't (it stops if either is wrong). If part of
the floor can't be reached, a room has no doorway in the model.

Without the original model, it rebuilds from the committed `lab.glb`
instead, taking its old lawn off first, so the grounds can change
without it.

The script:

1. Bakes each node's transform into its mesh.
2. Puts the floor at 0 and the plan's centre at the origin, and brings the
   walls down to `WALL_HEIGHT` (the export was at ten times scale, so they
   stood 20 m high).
3. Recomputes normals and makes the walls two-sided: some faces in the
   model are wound the wrong way and came out black. The floor and the
   columns, which have no material in the model, get plain concrete (glTF's
   default material is fully metallic and renders near-black).
4. Adds the meadow (`LAWN` in `client/plan.ts`).
5. Bakes the navmesh, with the barrier as a wall (but for its opening at
   the main door) while the lab is being fixed, finds the front wall's
   doorways, and checks the kubo and the lab are both reachable.
6. Joins meshes by material and meshopt-compresses the geometry.

## Run it locally

```bash
VITE_SEIZA_WORLD_ID=iscolab npm run dev   # PowerShell: $env:VITE_SEIZA_WORLD_ID="iscolab"; npm run dev
npm run worker:dev                        # in a second terminal
```

## Deploy

```bash
npx wrangler login
node worlds/iscolab/build.mjs
npx wrangler deploy --config worlds/iscolab/wrangler.jsonc
```

Then, in the Cloudflare dashboard, for the `iscolab` Worker:

1. **Settings > Variables and Secrets:** add `SEIZA_ADMIN_KEY` (or
   `SEIZA_EDITOR_PASSWORD`), and `CLOUDFLARE_TURN_KEY_ID` and
   `CLOUDFLARE_TURN_KEY_API_TOKEN` for voice across networks. Secrets
   belong to one Worker, so set them again here.
2. **Settings > Domains & Routes > Add > Custom domain:**
   `iscolab.seiza.cc`.

To deploy from git instead, create a Worker from the repository with build
command `node worlds/iscolab/build.mjs` and deploy command
`npx wrangler deploy --config worlds/iscolab/wrangler.jsonc`, as in
Seisugbo's README.

It shares the avatar store (`seiza-avatars`) with the other worlds; to keep
it apart, give it its own namespace id in `wrangler.jsonc` and remove step
3 of `build.mjs`.

## Files

```
worlds/iscolab/
  build.mjs              Builds the deployment into dist/
  wrangler.jsonc         ISCOLab's own Worker
  favicon.svg            ISCOLab's tab icon
  scripts/build-lab.mjs  Prepares the model and bakes the navmesh
  client/                The world's own code, loaded by Seiza only here:
    plan.ts              Where everything is (the bake reads it too)
    Barrier.tsx          The barrier, scaffolding, and sign, while being fixed
    Kubo.tsx             The temporary kubo
    grounds.ts           What's solid, and the benches' seats
    index.tsx            Wires it up
  world/world.json       The world's settings
  world/models/          lab.glb and lab.navmesh (committed)
  media-src/             The original model (not committed)
```
