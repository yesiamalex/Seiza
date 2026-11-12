# SeiOU

**SeiOU** is a walkable digital twin of the University of the Philippines
Open University's headquarters in Los Baños, Laguna, built on Seiza. Walk
the campus with others, step inside its buildings, and ask the guides,
Chancy Joan and Dean Rob, about UPOU or the way anywhere.

Unlike Seiza's other worlds, SeiOU doesn't use Seiza's built-in rooms: the
campus model is the whole world (`"environment": "model"` in
`world/world.json`; see DOCS.md, "A world made of its own model").

## What's in it

- **The campus:** the Oblation in the roundabout at the entrance, the Main
  Building under its arch, the four pods of the Teaching and Learning Hub,
  the CCDL Auditorium, the Academic Residences (AR), and the World-Class
  Multi-Purpose Building (WCMPB; its group in the model is named `WPCMB`).
  Visitors arrive on the drive, facing the Main Building, with the guides
  waiting in front of them.
- **Walking:** along the paths and roads, through doorways (doors stand
  open), into the buildings, and up the stairs the model has: the Main
  Building's upper floors, CCDL's upper level, and the WCMPB's second
  floor. Double-click the ground to walk there along the paths.
- **Lifts:** every building has a lift kiosk on each floor (`client/Lifts.tsx`):
  click a floor to go there. They're the way up where the model has no
  stairs: the Academic Residences, the Teaching and Learning Hub's pods,
  and the roofs. The floors come from `world/models/floors.json`, which the
  build script works out from the navmesh, so they follow the model; they're
  labelled by height (Ground, Level 2, …, Roof), and a level may be a
  mezzanine or a roof rather than a full storey.
- **The guides:** Chancy Joan and Dean Rob wait where visitors arrive,
  facing them, and now and then take a short stroll. Click one, or press
  **Ask Chancy Joan** or **Ask Dean Rob** at the top left. They answer
  about UPOU (its history, faculties, programs, rooms for events, the
  Oblation, each building) and getting around, with a gesture and a face to
  match each answer, and can walk you to any building, waiting if you fall
  behind. After a chat or a walk they linger a little, then walk back.
- **The sky** is a little more vivid than Seiza's other worlds
  (`"vibrance": 1.35` in `world.json`), and the camera sees 700 m
  (`"viewDistance"`), so the whole campus is drawn wherever you stand.

The guides answer only from what's written in `client/campus.ts`, offline:
nothing is generated, nothing leaves the visitor's device, and they say
when they don't know. Guardrails come first (no code, harm, personal
details, professional advice, or politics; a hotline for anyone hurting).
They're Seiza's shared guides (`src/guides/`), the same as Seizorai's
Ilaw-san.

## The campus model

The original model (`media-src/UPOU_Campus_Layout.glb`, about 100 MB, not
committed) becomes what the world serves with one script:

```bash
node worlds/seiou/scripts/build-campus.mjs
```

| | Original | Served |
| --- | --- | --- |
| File | 96 MB | `campus.glb`, 4.4 MB |
| Triangles | 972,000 | 394,000 |
| Meshes (draw calls) | 421 | 43 |
| Textures | up to 4096 px PNG and JPEG | at most 1024 px WebP |
| Walking | | `campus.navmesh`, 0.9 MB, baked once |
| Floors | | `floors.json`: each building's levels, for the lifts |

How: identical materials and meshes merged and unused data dropped; the
heaviest meshes simplified (the Oblation was 437,000 triangles alone, and a
plain gray mesh 170,000); textures shrunk to WebP; meshes joined by
material; geometry quantized and meshopt-compressed, which three.js decodes
with a decoder bundled in the app. The navmesh is baked from the same
geometry with doors left out (door objects, and door materials inside a
building like the Academic Residences), so every doorway is open. Steps
up to 0.6 m and slopes up to 60° count as walkable, so modelled stairs
connect. The script then checks that you can walk from the plaza into each
building, and writes each building's floors to `floors.json`.

The model is in metres, so it needs no scaling. To use an updated model,
put it in `media-src/` and run the script again; if building positions
change, update `PLACES` and the guides' rounds in `client/campus.ts`.

## Changing what the guides know

Edit `client/campus.ts`:

- **A topic:** a title, the answer, and several `asks` (ways people might
  put the question, in any language; varied wording helps most). Add a
  `place` to let the guides walk you there.
- **Places:** feet positions on the model. `walk: false` for a floor whose
  stairs the model doesn't have.
- **The guides:** their names, how they introduce themselves, their
  avatars, and their rounds. Their avatars are CC0 VRoid Studio samples for
  now; to use their own Avaturn avatars, convert them to `.vrm` in Seiza's
  avatar menu (which turns an Avaturn `.glb` into an optimized VRM),
  download or upload them to the deployment, and change `CHANCY_AVATAR`
  and `DEAN_ROB_AVATAR`.

Then `npm test`: `client/campus.test.ts` checks the guides still answer the
common questions and stay inside the campus.

Facts in the answers come from UPOU's own pages and Wikipedia (below).
Programs, fees, and offices change, so the guides point to upou.edu.ph for
admissions rather than quoting them. Still unconfirmed: what the WCMPB is
used for (the guides describe only what the model shows), and whether it
is the Multi-Purpose Hall UPOU lists among its rooms (the guides treat them
as separate). Check the answers before a public deployment.

## Layout

```
worlds/seiou/
  world/world.json              The world: the model, its navmesh, sky, spawn, avatars
  world/models/campus.glb       The campus, optimized (committed)
  world/models/campus.navmesh   Where people can walk (committed)
  media-src/                    The original model (gitignored, local only)
  scripts/build-campus.mjs      media-src/ → world/models/
  world/models/floors.json      Each building's floors, for the lifts (generated)
  client/
    index.tsx                   Registers and places the two guides and the lifts
    Lifts.tsx                   The lift kiosks
    campus.ts                   What the guides know, the places, the guides
    campus.test.ts              What they answer
  favicon.svg, build.mjs, wrangler.jsonc
```

## Build and run locally

```bash
npm install                                  # once, at the repository root
VITE_SEIZA_WORLD_ID=seiou npm run dev        # with `npm run worker:dev` in another terminal
```

Or as deployed:

```bash
node worlds/seiou/build.mjs
npx wrangler dev --config worlds/seiou/wrangler.jsonc
```

## Deploy from the Cloudflare dashboard

SeiOU is its own Worker, built from the same repository.

1. In the Cloudflare dashboard, go to **Workers & Pages**, choose
   **Create**, then **Import a repository**, and pick the repository.
2. Set up the project:
   - **Project name:** `seiou` (it must match `"name"` in
     `worlds/seiou/wrangler.jsonc`)
   - **Build command:** `node worlds/seiou/build.mjs`
   - **Deploy command:** `npx wrangler deploy --config worlds/seiou/wrangler.jsonc`
   - **Non-production branch deploy command** (if shown):
     `npx wrangler versions upload --config worlds/seiou/wrangler.jsonc`
   - **Root directory:** the repository root (`/`)
3. Under the Worker's **Settings > Variables and Secrets**, add
   `SEIZA_ADMIN_KEY` or `SEIZA_EDITOR_PASSWORD`, and the TURN secrets for
   voice across networks.

From the command line:

```bash
npx wrangler login
node worlds/seiou/build.mjs
npx wrangler deploy --config worlds/seiou/wrangler.jsonc
```

## References

- University of the Philippines Open University. Wikipedia. https://en.wikipedia.org/wiki/University_of_the_Philippines_Open_University
- UPOU. *UPOU breaks ground for Teaching and Learning Hub*. https://www.upou.edu.ph/news/upou-breaks-ground-for-teaching-and-learning-hub
- UPOU. *UPOU Facilities Catalog* (2024): the CCDL Auditorium and the Academic Residences. https://www.upou.edu.ph/wp-content/uploads/2024/07/UPOU-Facilities-Catalog.pdf
- UPOU Office of the Vice Chancellor for Finance and Administration. *CDMO services*: the Academic Residences and its cafeteria, the CCDL Auditorium, the Sandbox, the Oblation Hall, the Audio-Visual Room, and the Multi-Purpose Hall. https://ovcfa.upou.edu.ph/cdmo-home/cdmo-services/
- UPOU Helpdesk. *UPOU Faculties of Studies*. https://helpdesk.upou.edu.ph/support/solutions/articles/48001149034-upou-faculties-of-studies
- UPOU. *UPOU's 29th Commencement: A Historic First at the UPOU International Convention Center*. https://www.upou.edu.ph/tag/commencement-exercises
- Republic of the Philippines. (2014). *Republic Act No. 10650: Open Distance Learning Act*.
