# Seinag

**Seinag** is UP Open University's campus with hypothetical solar on its
roofs, running live on the sky you see. It's SeiOU's walkable campus
(worlds/seiou/), with the rooftop panels, a battery, a live dashboard,
and guides who know both the campus and its solar. The name is Seiza's
*sei* and the Filipino *sinag*, a ray of light.

None of it is UPOU's plan or its real figures. It shows what the roofs
could do, so students and staff can see and talk about it.

## What's in it

- **The campus:** everything in SeiOU. The model, its navmesh, the lift
  kiosks, and Chancy Joan and Dean Rob come from worlds/seiou/, and the
  build serves SeiOU's files at SeiOU's paths, so the two worlds never
  drift apart.
- **Rooftop panels:** 264 modules of about 400 W each on the flat roofs of
  the Main Building, the Teaching and Learning Hub, the CCDL, and the top
  of the World-Class Multimedia Production Building: about 106 kW at their peak,
  tilted 15° to the south. The WCMPB's roof deck stays clear for visitors,
  and the Academic Residences already has panels in the model. A script
  (`scripts/place-panels.mjs`) placed them wherever a whole module fits on
  flat, open roof, so the size follows the roofs rather than a guess.
- **The plant:** Seizora's plant model (worlds/seizora/sim/energy.ts),
  with this campus's own spec and demand (`client/plant.ts`): the sun over
  Los Baños, clouds from the shared weather, panels losing output as they
  heat up, wiring and inverter losses, a 200 kWh battery, and the grid for
  the rest. It runs on the same sky every visitor sees, with 24 hours of
  warm-up, so everyone sees the same numbers without sending any.
- **The campus's demand:** an assumed week for offices, classrooms, and
  labs, with aircon that rises with the heat. It peaks at about 0.25 MW on
  a hot weekday afternoon, more than the roofs make, so on weekdays every
  kilowatt is used at once. At the weekend only lights, servers, and
  security run, so the roofs make more than the campus uses and the battery
  fills. It isn't metered data.
- **The conference hall:** the CCDL's second floor, set up as in SeiOU.
- **Lights:** SeiOU's ceiling lights and switches, on every indoor floor.
- **The solar station:** an open shed on the grass north of the drive,
  ahead and to the left of where visitors arrive. Its sloped roof carries
  twelve modules of its own. Inside:
  - the live **dashboard** on the back wall: the roofs' output, the
    campus's use, the battery, the grid, and the last 24 hours;
  - a **console** like Seizora's control room's: breakers for the rooftop
    solar, the battery, and the grid tie, the battery's mode, and the time
    and weather, shared with everyone in the room;
  - the **battery cabinet**, its charge on a live strip;
  - Seizora's **perovskite lab bench**, where you design a solar cell and
    see its efficiency, cost, first-year yield, and how fast it fades, here
    in Metro Manila's weather.
  Three **study boards** outside its west side, toward the arrival point,
  explain the rooftop solar, the campus's use, and the battery, each with a
  live line. Click anything for its card.
- **The guides:** Chancy Joan and Dean Rob know everything they know in
  SeiOU, plus the solar, with live answers ("How much are the roofs making
  now?", 「今日はどのくらい発電した?」). Ask them to take you to the
  panels.

- **The imagined campus:** four "what if" layers over UPOU as it is, each
  something you can feel on a real walk across the campus. None of them is
  UPOU's plan. The **Imagined campus** board beside the station's study
  boards switches each on or off for everyone in the room (editors only,
  like the console), so a group can walk the same route with and without
  it.
  - **A covered walkway** from the Academic Residences' south door to the
    WCMPB's north corner, about 225 m over the lawn people cross in the
    open today. Its shade falls where the real sun casts it at that hour:
    under the roof at noon, east of it in the afternoon, thin under cloud.
    The world's shadow map covers only the rooms near its origin, so the
    walkway's and the trees' shade is their outline on the ground, moved
    each frame along the sun's direction (`shadeOffset` in
    `client/futures.ts`).
  - **Solar lampposts** along the walkway and at the garden's gate. Each
    has its own panel and battery, and switches itself on at dusk with the
    shared sky. They are real lights, drawn from the world's pool of four
    (src/scene/LightPool.tsx), so a dozen cost no more than four.
  - **More shade trees:** narra and acacia (rain tree), instanced, along
    the drive from the Oblation, the Main Building's back lawn, and the
    walkway's lawn, each with its moving shade.
  - **The FMDS Perma G.A.R.D.E.N.**, behind the Teaching and Learning Hub,
    which the campus model doesn't have, built out. Its Adopt-A-Plot beds
    (2 m × 2 m, organic) are as UPOU describes them. The compost bays,
    rainwater tanks fed by the learning hut's gutter, herb spiral, food
    forest (mango, banana, papaya, malunggay, calamansi), seedling nursery,
    and pollinator flowers are imagined, and the boards and guides say so.
  Each layer has a board that says what it is, with a live line (where the
  shade is now; whether the lamps are on), and a card. The guides know all
  four, answer "Where is the shade now?" and "Are the lamps on?" live, and
  give a seven-stop **permaculture tour** of the garden ("Give me a
  permaculture tour"), walking you from stop to stop.

Everything is in English and Japanese, like the rest of Seiza.

## Changing the solar

- **Where the panels go:** edit `BUILDINGS` in `scripts/place-panels.mjs`
  and run `node worlds/seinag/scripts/place-panels.mjs`. It writes
  `world/solar.json`, which the panels, the plant, and the guides all read.
- **The battery and the demand:** `CAMPUS` and `campusLoad` in
  `client/plant.ts`.
- **What the guides say about it:** `client/knowledge.ts`.

## Changing the imagined campus

- **Where things go:** `client/futures.ts`: the walkway's centre line
  (`WALKWAY`), the lampposts, the trees (`treeList`), and the garden's
  place, beds, and stations (`GARDEN`, `GARDEN_SPOTS`). Positions are
  metres on the campus model; its lawn is at y 0.1. `futures.test.ts`
  checks they stay clear of each other, the station, and where the guides
  take people.
- **How they look:** `client/Imagined.tsx`.
- **What the guides and cards say:** `client/futuresKnowledge.ts` and
  `client/cards.tsx`. Keep what's real about the garden apart from what's
  imagined, and check the garden's facts with FMDS before a public
  deployment: programmes and terms change.

## Layout

```
worlds/seinag/
  world/world.json             The world: SeiOU's model and navmesh, sky, spawn
  world/solar.json             Where each module goes (generated)
  scripts/place-panels.mjs     SeiOU's roofs → world/solar.json
  client/
    index.tsx                  Panels, dashboard, lifts, and the two guides
    plant.ts                   The campus plant: its spec and its demand
    plant.test.ts              Day and night, sun and rain
    live.ts                    The plant, running on the shared sky
    module.ts                  What a module looks like: cells, frame, legs
    Panels.tsx                 The rooftop modules
    Station.tsx                The solar station: shed, console, battery, boards, lab bench
    Dashboard.tsx              The live display on the station's back wall
    cards.tsx                  How it's worked out, the battery, and the campus's demand
    knowledge.ts               SeiOU's knowledge, plus the solar
    futures.ts                 The imagined campus: where each layer goes, its shade, its switches
    Imagined.tsx               The walkway, lampposts, trees, garden, their boards, and the switch board
    futuresKnowledge.ts        What the guides know about it, and the permaculture tour
    futures.test.ts            Placements, shade, and the guides' answers
  build.mjs                    Builds the deployment into dist/
  wrangler.jsonc               Seinag's own Worker
  favicon.svg                  The arch, with panels, under the sun
```

## Build and run locally

```bash
npm install                                  # once, at the repository root
VITE_SEIZA_WORLD_ID=seinag npm run dev       # with `npm run worker:dev` in another terminal
```

Or as deployed:

```bash
node worlds/seinag/build.mjs
npx wrangler dev --config worlds/seinag/wrangler.jsonc
```

## Deploy from the Cloudflare dashboard

Seinag is its own Worker, built from the same repository.

1. In the Cloudflare dashboard, go to **Workers & Pages**, choose
   **Create**, then **Import a repository**, and pick the repository.
2. Set up the project:
   - **Project name:** `seinag` (it must match `"name"` in
     `worlds/seinag/wrangler.jsonc`)
   - **Build command:** `node worlds/seinag/build.mjs`
   - **Deploy command:** `npx wrangler deploy --config worlds/seinag/wrangler.jsonc`
   - **Non-production branch deploy command** (if shown):
     `npx wrangler versions upload --config worlds/seinag/wrangler.jsonc`
   - **Root directory:** the repository root (`/`)
3. Under the Worker's **Settings > Variables and Secrets**, add
   `SEIZA_ADMIN_KEY` or `SEIZA_EDITOR_PASSWORD`, and the TURN secrets for
   voice across networks.

From the command line:

```bash
npx wrangler login
node worlds/seinag/build.mjs
npx wrangler deploy --config worlds/seinag/wrangler.jsonc
```

## References

The physics and the grid's emission factor are Seizora's; see
worlds/seizora/README.md.

The Perma G.A.R.D.E.N.'s name, place, purpose, and Adopt-A-Plot's terms
come from FMDS's own pages; the permaculture course from FLIP Science:

- Faculty of Management and Development Studies, UPOU. (2024, March 9).
  *Adopt-A-Plot*. https://fmds.upou.edu.ph/public-service/adopt-a-plot/
- FLIP Science. *Permaculture Systems Design Thinking, UPOU*.
  https://www.flipscience.ph/?p=14204 The campus model and what the guides know about
UPOU are SeiOU's; see worlds/seiou/README.md.
