# Seishore

**Seishore** is a small Japanese seaside town, after Yuigahama in Kamakura on
the Shonan coast, a much-loved and livable stretch of coast south of Tokyo:
a getaway for an afternoon, and a place to practise Japanese and English
with the people who live there. It's built on Seiza's own grounds (the
meadow, the coast, the beach) at `seishore.seiza.cc`. Its shop names and
signs are its own; it imitates no real business.

## What's in it

- **The street** (`client/Town.tsx`, laid out in `client/plan.ts`): a
  shōtengai of two-storey houses with tiled roofs, balconies and wind chimes,
  utility poles and their wires, a curved traffic mirror, vending machines
  (click one for a drink), a fish shop, a surf shop.
- **Rooms you walk into:** Umi Mart, the konbini (shelves, fridges,
  magazines, the counter and its clerk, the door chime, the fridges' hum, a
  greeting as you come in); Shiosai, the café (tables for two you can sit
  at, coffee steaming); Hama Kitchen, the family restaurant (booths, the
  kitchen's pass and its chef, the drink bar, customers at their tables).
- **The Shiokaze Line** (`client/Transit.tsx`, timetable in
  `client/vehicles.ts`): a two-car train along the coast between
  Seishore-Kaigan station, by the street, and Yamanomae, at the mountain's
  foot. A level crossing at the top of the street, after the famous one by
  Kamakura-Kōkōmae station, with its bell, lights and barriers, and a bench to
  watch from. Click a seat inside to ride; stand up to get off.
- **The bus:** up and down the coast road, stopping by the sea. Sit inside
  and ride it too. Both have drivers and passengers, and announce their
  stops in Japanese and English. Every visitor sees them in the same place:
  the timetable runs off the clock, with nothing sent over the network.
- **The shrine** by the campsite: click its offering box and you throw a
  coin, ring the bell, bow twice, clap twice, pray, and bow (captions show
  each step); a fortune box (omikuji) beside it. **The temple**, Seikai-ji, by
  Yamanomae: hands together, no clapping, incense smoke.
- **People** (`client/people.ts`, `client/knowledge.ts`): Haruka at the
  konbini, Mio at the café, Takeda-san the chef, Genji-san the fisherman,
  Kaito the surfer, Satō-san the neighbour, Yūto the student. Each says
  things now and then in a bubble, Japanese with English under it, and aloud
  in Japanese when you're close (the browser's own voice, if it has one).
  Click one to ask about the town, its food, the shrine and the temple, the
  train, or how to say something; every answer shows both languages. No
  language model: Seiza's guides' own small retriever, answering from what's
  written here.
- **Sounds**, all made in code: the surf, black kites and gulls, wind
  chimes, the crossing's bell, the train's motors and rail joints, the bus's
  diesel and air doors, the kitchen's sizzle.
- **Sky:** Kamakura's (`"site": "shonan"`), its sun and seasons, and Seiza's
  Japanese seasons.

## Deploy

```bash
npx wrangler login
node worlds/seishore/build.mjs
npx wrangler deploy --config worlds/seishore/wrangler.jsonc
```

Then, in the Cloudflare dashboard, for the `seishore` Worker:

1. **Settings > Variables and Secrets:** add `SEIZA_ADMIN_KEY` (or
   `SEIZA_EDITOR_PASSWORD`), and `CLOUDFLARE_TURN_KEY_ID` and
   `CLOUDFLARE_TURN_KEY_API_TOKEN`. Secrets belong to one Worker.
2. **Settings > Domains & Routes > Add > Custom domain:** `seishore.seiza.cc`.

Run it locally:

```bash
VITE_SEIZA_WORLD_ID=seishore npm run dev   # PowerShell: $env:VITE_SEIZA_WORLD_ID="seishore"; npm run dev
npm run worker:dev                         # in a second terminal
```
