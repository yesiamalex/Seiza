# Seizora

**Seizora** (星空, "starry sky") is a Seiza world about solar futures: a
solar, wind, and storage microgrid for a Philippine community, and a
perovskite solar lab, from the cell's layers to a local energy system. It
is Seiza's child project: the same app and server, its own world, deployed
on its own.

It's a learning model. The physics is standard (sun position, irradiance on
tilted panels, temperature derating, a turbine power curve, battery limits
and losses), but the plant is invented and the weather is synthetic. Real
estimates need measured equipment data and local weather records.

## What's in it

- **The world.** Seiza's hall, classroom, and garden, with the moving sky
  set to Cebu. In the garden: a solar array of three rows (the back row is a
  perovskite pilot, in brown), a battery container with its transformer,
  and two wind turbines beyond the wall. In the classroom: an exploded
  perovskite cell on a pedestal. Illustrated info boards stand by each
  exhibit, and a screen in the hall is marked as the control room.
- **The control room** at `/seizora/` on the same site. It runs the
  microgrid minute by minute and shows megawatts flowing from each source to
  the community load, the battery's charge, imports and exports, the last
  24 hours, totals with CO₂ avoided, and an event log. Every part of the
  plant has an ⓘ pop-up with an illustration and an explanation.
  - **Live** follows the world's own clock and weather schedule, so the
    numbers match the sky visitors are standing under. That includes a
    time or weather an editor sets in the world's edit panel; a note under
    the mode switch says when one is set.
  - **Simulate** lets a class scrub the hour and the day, run time at up to
    six hours a second, call in any weather including a typhoon, flip the
    breakers, cut the grid tie (island mode), and change how the battery is
    run and how the perovskite row is sealed.
- **The perovskite lab** (a tab of the control room) follows the concept's
  four stations: build the cell layer by layer, test the trade-offs between
  efficiency, cost, and durability, and put it on a roof, a facade, or a
  transit shelter in Philippine sun, heat, and humidity, with a year of fade.
  The fourth station, a local energy system, is the Microgrid tab.

To show the control room in the world, open `/seizora/` in a tab and share
that tab onto the hall screen. Learners can also open it on their own.

## Layout

```
worlds/seizora/
  world/world.json      The world: sky, spawn, avatars, and the starting objects
  models/               Generates the 3D models and the info board models (.glb)
  boards/               The info boards' artwork (PNG) and the script that draws it
  sim/                  The control room: energy model, page, info cards, tests
  build.mjs             Builds the whole deployment into dist/
  wrangler.jsonc        Seizora's own Worker: name, bindings, world id
```

Seizora changes nothing in Seiza's code. It builds Seiza's client unchanged
with the world set to `seizora`, then adds its own files to the output. The
one thing it shares is Seiza's weather and sky engine
(`src/sky/weather.ts`), imported rather than copied, so the control room
and the sky can never disagree.

## Build and run locally

```bash
npm install                                   # once, at the repository root
node worlds/seizora/build.mjs                 # builds into dist/
npx wrangler dev --config worlds/seizora/wrangler.jsonc
```

Then open http://localhost:8787 for the world and
http://localhost:8787/seizora/ for the control room. Building Seiza's
default world afterwards (`npm run build`) puts dist/ back to the default.

Tests: `npm test` runs Seizora's energy tests with Seiza's own.

After editing a board's text in `boards/make_boards.py`, redraw the PNGs
with `python worlds/seizora/boards/make_boards.py` and commit them; the
build mounts them, and needs no Python.

## Deploy from the Cloudflare dashboard

Seizora is a second Worker built from the same repository. Your existing
Seiza deployment is not affected.

1. Make sure the repository (your fork of Seiza) is on GitHub or GitLab.
2. In the Cloudflare dashboard, go to **Workers & Pages** and choose
   **Create** (or **Create application**).
3. Choose **Import a repository**, connect your Git account if asked, and
   pick the repository.
4. Set up the project:
   - **Project name:** `seizora`. It must match `"name"` in
     `worlds/seizora/wrangler.jsonc`; change both if you want another name.
   - **Build command:** `node worlds/seizora/build.mjs`
   - **Deploy command:** `npx wrangler deploy --config worlds/seizora/wrangler.jsonc`
   - **Non-production branch deploy command** (if shown):
     `npx wrangler versions upload --config worlds/seizora/wrangler.jsonc`
   - **Root directory:** leave as the repository root (`/`).
5. Choose **Deploy**. The first build takes a few minutes. When it
   finishes, the dashboard shows the site's address, something like
   `seizora.<your-subdomain>.workers.dev`.
6. Optional, under the Worker's **Settings > Variables and Secrets**, add the
   same secrets as Seiza's own deployment (see Seiza's DOCS.md):
   - `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_KEY_API_TOKEN`, so voice
     works across different networks.
   - `SEIZA_EDITOR_PASSWORD` or `SEIZA_ADMIN_KEY`, to control who can
     rearrange the world.
7. Optional: add a custom domain under **Settings > Domains & Routes**.

Every push to the branch you chose rebuilds and redeploys Seizora, and,
separately, Seiza's own project if it's connected too. The two keep their
own rooms. They do share the avatar store (the `seiza-avatars` namespace),
so avatars and editor uploads appear in both; to keep them apart, give
Seizora its own namespace id in `worlds/seizora/wrangler.jsonc` and remove
step 5 of `build.mjs`.

### From the command line instead

```bash
npx wrangler login
node worlds/seizora/build.mjs
npx wrangler deploy --config worlds/seizora/wrangler.jsonc
```

## The first visit

A world's starting objects are placed by the first person to enter an empty
room who is allowed to edit it. If you set an editor password or admin key,
enter it on your first visit so the exhibits are placed. After that they
belong to the room like anything else: movable, and deletable in Edit Mode.
