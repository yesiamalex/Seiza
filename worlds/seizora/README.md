# Seizora

**Seizora** (星空, "starry sky") is a Seiza world about solar futures: a
solar, wind, and storage microgrid for a Philippine community, and a
perovskite solar lab, from the cell's layers to a local energy system. It
is Seiza's child project: the same app and server, its own world, deployed
on its own.

It's a learning model. The physics is standard (sun position, irradiance on
tilted panels, temperature derating, a turbine power curve, battery limits
and losses), and every constant is taken from a published source, listed
under [How the numbers line up](#how-the-numbers-line-up). But the plant is
invented and the weather is synthetic: Seizora's "auto" weather follows a
seasonal schedule, not Cebu's actual weather. Real estimates need measured
equipment data and local weather records.

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
  first-year yield for a typical year of Cebu's sun, and how fast it fades.
- **Info boards** by each exhibit, and a welcome board in the hall, each
  with a live line of what that part of the plant is doing now. Click any
  board or exhibit for its explanation card.

The plant runs in every visitor's browser on the exact time and weather the
sky shows, with the switches shared through the room. On arrival it runs
the previous 24 hours first, so everyone sees the same battery charge and
history instead of numbers that depend on when they came in.

## How the numbers line up

Every figure a visitor reads (on a board, a card, the display, or in the
"now" line) comes from the same model in `sim/energy.ts` and the shared
engine in `src/sky/weather.ts`, and the figures below are pinned by tests in
`sim/energy.test.ts`, so a change to one shows up as a failing test rather
than a board that disagrees with the display.

| What | Value in the model | Source |
| --- | --- | --- |
| Sun position | Cooper's declination and the equation of time; within about a degree | Duffie & Beckman (2013) |
| Clear-sky sunlight | Haurwitz model; about 1,000 W/m² at a high noon sun | Haurwitz (1945); Reno et al. (2012) |
| Cloud | G = G_clear · (1 − 0.75 N^3.4); a quarter gets through under full overcast | Kasten & Czeplak (1980) |
| Haze | 18% of clear-sky sunlight lost to humid tropical haze, calibrated to the Global Solar Atlas | DOE Philippines; Global Solar Atlas |
| Year-one yield | About 1,400 to 1,460 kWh per kWp for a 15° rooftop in Manila (atlas: 1,402) | DOE Philippines; Global Solar Atlas |
| Panel on a tilt | Isotropic sky; ground reflection left out | Duffie & Beckman (2013) |
| Cell temperature | NOCT method, NOCT 45 °C; 55 to 65 °C in Philippine sun | Duffie & Beckman (2013) |
| Silicon heat loss | −0.35% per °C | Dupré, Vaillon & Green (2015) |
| Perovskite heat loss | −0.17% per °C | Jošt et al. (2020) |
| System losses | 14% (PVWatts default) and a 96% inverter: about 17% in all | Dobos (2014) |
| Plant size | 3.6 MWp silicon, 0.6 MWp perovskite: about 4 to 5 ha in reality; the garden rows stand in for it | — |
| Wind | P = ½ρAv³; cut-in 3.5 m/s, rated 12 m/s, cut-out 25 m/s; rotors 10 to 20 rpm | Manwell et al. (2009); GE 1.5 MW data |
| Turbine size | 2 × 1.5 MW; real ones have 77 m rotors on 80 m towers, so the garden's are scale models | GE 1.5 MW data |
| Battery | 6 MWh, 3 MW, 85% round trip, kept between 10% and 95% | Cole & Frazier (2019); EIA (2021) |
| Battery dispatch (Auto) | Stores any surplus; on the grid it covers only the load above 65% of the peak (about 2.1 MW), so its charge lasts through the evening peak; in island mode it covers all it can | Peak shaving, the usual job of a grid-tied community battery |
| CO₂ avoided | 0.71 t per MWh generated | DOE Philippines 2015–2017 grid emission factor (Luzon–Visayas operating margin, 0.7122) |
| Perovskite durability | Moisture, oxygen, heat, and light; rates illustrative, ordered as in the literature; T80 as the stability measure | Boyd et al. (2019); Khenkin et al. (2020) |
| Perovskite efficiency | Lab options 19 to 23.5%, below the best single-junction cells (about 27%) | NREL chart |
| Seasons | Dry December to May, wet June to November (PAGASA climate Type I); Cebu itself is mostly Type III and less seasonal | PAGASA |
| Load | An illustrative evening-peaking community load, peak 3.2 MW | — (not measured) |

What is invented: the plant, its load, and the weather. What is not: the
physics, and every constant above.

## References

- Boyd, C. C., Cheacharoen, R., Leijtens, T., & McGehee, M. D. (2019). Understanding degradation mechanisms and improving stability of perovskite photovoltaics. *Chemical Reviews, 119*(5), 3418–3451. https://doi.org/10.1021/acs.chemrev.8b00336
- Cole, W., & Frazier, A. W. (2019). *Cost projections for utility-scale battery storage* (NREL/TP-6A20-73222). National Renewable Energy Laboratory. https://doi.org/10.2172/1529218
- Department of Energy, Philippines. (2018). *2015–2017 National Grid Emission Factor*. https://legacy.doe.gov.ph/node/11258
- Department of Energy, Philippines. *Solar panels rough estimate for residential use* (Global Solar Atlas PVOUT, Metro Manila: 1,402.1 kWh/kWp). https://doe.gov.ph/sites/default/files/pdf/consumer_connect/Solar-Panels-Rough-Estimate-for-Residential-Use.pdf
- Dobos, A. P. (2014). *PVWatts version 5 manual* (NREL/TP-6A20-62641). National Renewable Energy Laboratory. https://doi.org/10.2172/1158421
- Duffie, J. A., & Beckman, W. A. (2013). *Solar engineering of thermal processes* (4th ed.). Wiley. https://doi.org/10.1002/9781118671603
- Dupré, O., Vaillon, R., & Green, M. A. (2015). Physics of the temperature coefficients of solar cells. *Solar Energy Materials and Solar Cells, 140*, 92–100. https://doi.org/10.1016/j.solmat.2015.03.025
- Green, M. A., Ho-Baillie, A., & Snaith, H. J. (2014). The emergence of perovskite solar cells. *Nature Photonics, 8*(7), 506–514. https://doi.org/10.1038/nphoton.2014.134
- Haurwitz, B. (1945). Insolation in relation to cloudiness and cloud density. *Journal of Meteorology, 2*(3), 154–166. https://doi.org/10.1175/1520-0469(1945)002<0154:IIRTCA>2.0.CO;2
- Jošt, M., Lipovšek, B., Glažar, B., Al-Ashouri, A., et al. (2020). Perovskite solar cells go outdoors: Field testing and temperature effects on energy yield. *Advanced Energy Materials, 10*(25), 2000454. https://doi.org/10.1002/aenm.202000454
- Kasten, F., & Czeplak, G. (1980). Solar and terrestrial radiation dependent on the amount and type of cloud. *Solar Energy, 24*(2), 177–189. https://doi.org/10.1016/0038-092X(80)90391-6
- Khenkin, M. V., et al. (2020). Consensus statement for stability assessment and reporting for perovskite photovoltaics based on ISOS procedures. *Nature Energy, 5*(1), 35–49. https://doi.org/10.1038/s41560-019-0529-5
- Manwell, J. F., McGowan, J. G., & Rogers, A. L. (2009). *Wind energy explained: Theory, design and application* (2nd ed.). Wiley. https://doi.org/10.1002/9781119994367
- Meeus, J. (1998). *Astronomical algorithms* (2nd ed.). Willmann-Bell. (The moon's cycle and reference new moon.)
- National Power Corporation. *Missionary electrification plan 2025–2029*. https://www.napocor.gov.ph/wp-content/uploads/Operations/NPC_Missionary_Electrification_Plan_2025-2029.pdf
- National Renewable Energy Laboratory. *Best research-cell efficiency chart*. https://www.nrel.gov/pv/cell-efficiency.html
- Philippine Atmospheric, Geophysical and Astronomical Services Administration. *Climate of the Philippines*. https://www.pagasa.dost.gov.ph/information/climate-philippines
- pv magazine. (2024, November 28). Japan aims to deploy 20 GW of perovskite solar by 2040. https://www.pv-magazine.com/2024/11/28/japan-aims-to-deploy-20-gw-of-perovskite-solar-by-2040/
- Reno, M. J., Hansen, C. W., & Stein, J. S. (2012). *Global horizontal irradiance clear sky models: Implementation and analysis* (SAND2012-2389). Sandia National Laboratories. https://doi.org/10.2172/1039404
- U.S. Energy Information Administration. (2021, February 12). Utility-scale batteries and pumped storage return about 80% of the electricity they store. *Today in Energy*. https://www.eia.gov/todayinenergy/detail.php?id=46756
- Wind-turbine-models.com. *GE 1.5s* technical data (and the GE 1.5sle: 77 m rotor, 3.5/12/25 m/s, 10.1 to 20.4 rpm). https://en.wind-turbine-models.com/turbines/565-ge-vernova-ge-1-5s

The same list is in `sim/references.ts`, and each explanation card in the
world shows the sources it rests on, linked.

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
  sim/                  The energy model, its tests, the cards' text, and the references
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
