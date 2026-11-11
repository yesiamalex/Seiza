# Seisugbo

**Seisugbo: Meiji × UP Arts-Based Research 2026** is a Seiza world for the
art and photos from a face-to-face collaboration in Cebu. Students from
Meiji University and the University of the Philippines walked the city
together, through its markets, streets, and neighbourhoods, and then made art
about what stayed with them, naming each piece in Japanese, English, and
Filipino or Cebuano. The world carries that work to people who weren't
there. *Sugbo* is Cebu's old name.

It is the fourth Seiza world, after Seiza's default world, Seizora, and
Seilaya. It lives entirely in this folder and uses Seiza's world extension
hook, so the other worlds are unaffected.

## What's in it

Visitors wake at the tent on the meadow and look east down the lane.

- **The lane.** A model Cebu neighbourhood, built in code: painted houses
  close together, galvanized roofs held down with tyres, power lines strung
  pole to pole, fiesta bunting, washing on the line, a sari-sari store on
  the corner, a rack of bulad (dried fish) with Group C's paper fish hanging
  over it, street lamps, and a barangay arch at the entrance ("Maayong
  pag-abot sa Seisugbo"). It is a model, not one real place, drawn from the
  students' own photos and drawings (Group D's *Energy* above all).
- **The walking tour.** Eleven photos from the tour stand on placards along
  the lane, in walking order.
- **The covered court.** A barangay court, given over to the exhibition.
  Each group's art hangs on its own *sampayan* (clothesline) with wooden
  pins, with a label under each piece carrying the words its makers chose.
  Group A's collage posters fill a cork board at the far end.
- **Boards.** A welcome by the tent, the court's board where the path meets
  the lane, *Arts-based research* (how the work was made) in the hall, and
  *Let's talk*, three rounds of conversation prompts in English and
  Filipino, in the classroom. The dance is framed on the classroom's back wall.
- **A close-up view.** Click any piece or board. On a screen it opens large,
  with its group, its words, and a caption, and Previous and Next walk along
  its line or the lane. In a headset it opens as a panel in front of you
  (`?seisugboXrPreview` shows that panel on a flat screen, for checking).

Everything else is Seiza's own: voice, chat, gestures, editing, the sky
over Cebu, and the screens in the hall and classroom for presenting.

## Performance

The project's FrameVR version lagged, so this one is built to stay light
on a phone and a standalone headset:

- **The pictures are small.** 51 photos, 43 MB as taken, become 1.3 MB of
  WebP for the world (at most 512 px on the long edge) plus a 1600 px copy
  of each that downloads only when someone opens that piece. Metadata,
  GPS positions included, is stripped.
- **Nothing loads until you're near it.** A picture downloads when the
  camera comes within about 34 m of it, two at a time, nearest first, so a
  visitor who never walks to the court never downloads the court.
- **Far areas aren't drawn.** The lane and the court stop drawing when
  you're more than about 60 m and 55 m away (the classroom and the hall
  can't see them anyway).
- **The structures are a handful of draw calls.** Every house, roof, wire,
  flag, and shirt is merged into one mesh per material, with each house's
  paint as vertex colour; all the labels are one texture and one mesh per
  area; all the pins are one mesh. Each picture is one draw call.
- **Night costs no extra lights.** Windows and lamps glow, boards and
  labels are washed from the top with a light map, and the lane's and
  court's lamps use Seiza's shared pool of four lights.
- **Collision is boxes,** as in the rest of Seiza: houses, posts, the
  lines (walk round the ends, not through the art), boards, and the rack.

## Changing the content

- **Captions, words, credits:** `client/collection.ts`, one entry per
  picture. Add `by: "Name"` to credit a person, with their permission.
  The captions describe what each photo shows; check the place names (the
  first photo names the Heritage of Cebu Monument in Parián).
- **Board text:** `client/info.ts`.
- **A new or replaced picture:** put the original in `media-src/` (not
  committed), named like the others (`GroupB_7.jpg` becomes `b7`), run
  `node worlds/seisugbo/scripts/optimize-media.mjs`, and add an entry to
  `client/collection.ts`. Art (`kind: "art"`) goes on its group's line in
  the court, `"poster"` on the cork board, `"tour"` needs a stop in
  `TOUR` in `client/plan.ts`.

The pictures belong to the students and photographers, not to Seiza's
license (see THIRD_PARTY_ASSETS.md). Before a public deployment, make sure
the makers, and anyone recognizable in the photos, are happy for them to be
there.

## Layout

```
worlds/seisugbo/
  world/world.json          The world: sky, spawn, avatars, starting objects
  world/media/tex/          The pictures in the world (small)
  world/media/view/         The same, larger, for the close-up view
  media-src/                The original photos (gitignored, local only)
  scripts/optimize-media.mjs  media-src/ → world/media/
  client/                   The world's own code, loaded by Seiza only here:
    index.tsx               Wires everything up
    plan.ts                 Where things are on the meadow
    collection.ts           Every picture: group, words, caption
    info.ts                 The boards' text
    Lane.tsx                The lane, its houses, wires, store, and tour
    Court.tsx               The covered court and the sampayan
    Boards.tsx              The text boards and the dance photos
    art.tsx                 A picture, its labels, and pins
    Hud.tsx, Xr.tsx         The close-up view, on a screen and in a headset
    viewer.ts               Which piece is open
    kit.tsx                 Merged geometry, lazy pictures, night lighting
  favicon.svg               Seisugbo's tab icon
  build.mjs                 Builds the deployment into dist/
  wrangler.jsonc            Seisugbo's own Worker
```

## Build and run locally

```bash
npm install                                     # once, at the repository root
VITE_SEIZA_WORLD_ID=seisugbo npm run dev        # hot reload; needs `npm run worker:dev` in another terminal
```

Or as it will be deployed:

```bash
node worlds/seisugbo/build.mjs
npx wrangler dev --config worlds/seisugbo/wrangler.jsonc
```

Then open http://localhost:8787. Building another world afterwards puts
dist/ back to that world.

## Deploy from the Cloudflare dashboard

Seisugbo is its own Worker, built from the same repository. Seiza, Seizora,
and Seilaya are not affected.

1. Push the repository to GitHub or GitLab.
2. In the Cloudflare dashboard, go to **Workers & Pages** and choose
   **Create** (or **Create application**), then **Import a repository**,
   and pick the repository.
3. Set up the project:
   - **Project name:** `seisugbo` (it must match `"name"` in
     `worlds/seisugbo/wrangler.jsonc`; change both for another name)
   - **Build command:** `node worlds/seisugbo/build.mjs`
   - **Deploy command:** `npx wrangler deploy --config worlds/seisugbo/wrangler.jsonc`
   - **Non-production branch deploy command** (if shown):
     `npx wrangler versions upload --config worlds/seisugbo/wrangler.jsonc`
   - **Root directory:** the repository root (`/`)
4. Choose **Deploy**. The site appears at
   `seisugbo.<your-subdomain>.workers.dev`.
5. Under the Worker's **Settings > Variables and Secrets**, add its own
   secrets (secrets belong to one Worker):
   - `SEIZA_EDITOR_PASSWORD` or `SEIZA_ADMIN_KEY`, so visitors can't
     rearrange the room, and a facilitator can mute, remove, or gather
     people. **Set one before sharing the link.**
   - `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_KEY_API_TOKEN`, so voice
     works across school and mobile networks.
6. Optional: a custom domain under **Settings > Domains & Routes**.

Every push to the chosen branch rebuilds Seisugbo, alongside any other
world connected the same way. It shares the avatar store (`seiza-avatars`)
with them; to keep it apart, give it its own namespace id in
`wrangler.jsonc` and remove step 3 of `build.mjs`.

### From the command line instead

```bash
npx wrangler login
node worlds/seisugbo/build.mjs
npx wrangler deploy --config worlds/seisugbo/wrangler.jsonc
```
