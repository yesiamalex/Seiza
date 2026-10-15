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

Everything is in the world itself; there's no separate page to open.

- **The control room**, at the front of the classroom. A live display
  across the chalkboard wall, which the desks already face, shows:
  - megawatts from the silicon panels, the perovskite pilot, and the wind
    turbines, the town's load, the battery, and the main grid
  - the battery's charge, the sun, sunlight, cell temperature, wind, cloud,
    and humidity
  - the last 24 hours as a chart, with totals: energy generated, the share
    of the load the plant served itself, CO₂ avoided, grid imports and
    exports, and load that went unserved
  - a line at the bottom saying what the plant is doing right now and why,
    such as "Hot panels: the cells are at 56 °C…"

  Click a part of the display for an explanation card with an illustration
  and something to try.
- **The console**, beside the teacher's desk, runs the plant and the sky
  for everyone in the room:
  - breakers for the silicon panels, the perovskite row, the wind turbines,
    the battery, and the grid tie (open it for island mode)
  - the battery's mode (auto, charge, hold, discharge) and the perovskite
    row's seal (glass, edge, none)
  - the time (real time, or held at 06:00, 10:00, 12:00, 14:00, 18:00, or
    00:00, or running at 360×) and the weather (auto, clear, cloudy,
    overcast, rain, typhoon). These set the room's sky, so the real sky
    overhead changes with them.

  When the deployment has an editor password, only editors can use the
  console; everyone else sees it but can't press it.
- **The garden.** The solar array (three rows facing south at 15°; the back
  row is the perovskite pilot, in brown), the battery container with a
  strip that shows its charge (green while charging, amber while
  discharging), and two wind turbines beyond the wall whose rotors turn
  with the power they're making. They slow and stop when the wind drops,
  when a typhoon makes them feather and brake, or when their breaker is
  open.
- **The perovskite lab**, at the back of the classroom. An exploded cell on
  a pedestal shows the layers; its absorber turns yellow as the pilot row
  outside degrades, as real perovskite does when moisture gets in. The lab
  bench beside it lets each visitor design a cell (absorber, electron and
  hole layers, seal, and where it's mounted) and see its efficiency, cost,
  first-year yield in Cebu's weather, and how fast it fades.
- **Info boards** by each exhibit, and a welcome board in the hall, each
  with a live line of what that part of the plant is doing now. Click any
  board or exhibit for its explanation card.

The plant runs in every visitor's browser on the exact time and weather the
sky shows, with the switches shared through the room. On arrival it runs
the previous 24 hours first, so everyone sees the same battery charge and
history instead of numbers that depend on when they came in.

## Layout

```
worlds/seizora/
  world/world.json      The world: sky, spawn, avatars, and the starting objects
  client/               The world's own code, loaded by Seiza only for this world:
    live.ts             The plant, stepped every frame on the sky's time and weather
    ControlRoom.tsx     The display and the console
    Exhibits.tsx        The array, battery, turbines, perovskite cell, and boards
    Lab.tsx             The perovskite lab bench
    InfoCard.tsx        The explanation cards
  sim/                  The energy model, its tests, and the cards' text
  build.mjs             Builds the whole deployment into dist/
  wrangler.jsonc        Seizora's own Worker: name, bindings, world id
```

Seiza loads `client/` through its world extension hook
(`src/worlds/WorldExtension.tsx`; see DOCS.md, "World code"). It's a
separate chunk that only the Seizora world downloads, so Seiza's default
world is unaffected. The exhibits and boards are built in code at startup,
so there are no model or image files to generate. Seizora shares Seiza's
weather and sky engine (`src/sky/weather.ts`) rather than copying it, so
the plant and the sky can never disagree.

A room set up before the exhibits were built in still has the old ones as
placed objects. The first editor to visit removes them automatically.

## Build and run locally

```bash
npm install                                   # once, at the repository root
node worlds/seizora/build.mjs                 # builds into dist/
npx wrangler dev --config worlds/seizora/wrangler.jsonc
```

Then open http://localhost:8787. Building Seiza's default world afterwards
(`npm run build`) puts dist/ back to the default.

Tests: `npm test` runs Seizora's energy tests with Seiza's own.

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
step 3 of `build.mjs`.

### From the command line instead

```bash
npx wrangler login
node worlds/seizora/build.mjs
npx wrangler deploy --config worlds/seizora/wrangler.jsonc
```

## The first visit

The exhibits, boards, control room, and lab are part of the world, so they
are there for everyone from the start. The room's own starting objects are
just a screen in the hall for presenting and a note on a desk; the first
person allowed to edit places them. If you set an editor password or admin
key, enter it on your first visit. That also clears out the old exhibit
objects from a room set up before this version.
