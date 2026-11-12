# Seizorai

**Seizorai** (Seizora + AI) is [Seizora](../seizora/README.md), the solar,
wind, and storage learning world, with a guide: **Ilaw-san**, a student who
walks the exhibits all day and answers visitors' questions. *Ilaw* is
Filipino for light; *-san* is the Japanese honorific.

Everything about the plant, the control room, the exhibits, and the lab is
Seizora's, copied into this folder so the two worlds can grow apart. See
Seizora's README for the plant and its sources.

## Ilaw-san

- **She waits by the campfire where everyone arrives,** facing them, and
  now and then takes a short stroll across the meadow. Her day runs on the
  wall clock, so every visitor sees her in the same place with nothing sent
  over the network. Ask her and she'll walk you to any exhibit.
- **Click her to talk** (point and pull the trigger in a headset; look at
  her in a phone viewer), or press **Ask Ilaw-san** at the top left. She
  comes and stands beside you while you talk (on your screen only), then
  lingers a little and walks back to the campfire.
- **She answers from what was written for this world:** Seizorai's info
  cards, a set of questions and answers about the world, getting around,
  sustainability, climate, saving electricity, and rooftop solar, and the
  live plant ("what's the battery doing right now?" gives this second's
  charge). Answers can open the matching info card or take you to the
  exhibit.
- **She shows how she means it,** with Seiza's own gestures and faces: a
  wave hello, gasshō for thanks, a bow when she declines or introduces
  herself, a shrug when she doesn't know, pointing at a live reading
  (worried if homes are going dark), a raised hand for a tour, cheering a
  joke, nodding through an explanation.
- **In a headset** there's no keyboard, so her answer appears on a panel
  beside her with the next questions as buttons, "Take me there", and Close.

She is the CC0 VRoid Studio sample "Sendagaya Shino" (pixiv Inc.), one of
the avatars the world already offers visitors, animated by Seiza's own
walk, idle, and gesture clips. To change her look, set `ILAW_AVATAR` in
`client/ilaw/knowledge.ts` to another licensed `.vrm`.

She runs on Seiza's shared guides (`src/guides/`, see DOCS.md, "Guides"),
the same as SeiOU's Chancy Joan and Dean Rob. Ask her to walk you
somewhere and she leads the way along the world's paths, waiting if you
fall behind; "Take me there now" moves you at once.

### How she answers, and why she can't go off the rails

Ilaw-san is not a generative model. She never writes a sentence nobody
wrote: every answer is one of the answers in `client/ilaw/knowledge.ts`
(or a fixed sentence with a live number in it). A question goes through,
in order (Seiza's `src/guides/brain.ts`, with Seizorai's knowledge):

1. **Guardrails.** Requests for code, homework written for you, anything
   harmful, sexual, or about other people's personal details, medical,
   legal, or financial advice, and politics get a kind, fixed reply and a
   steer back. Someone who may be hurting is pointed to a person and a
   hotline (NCMH 1553; 911 in the Philippines, 119 in Japan).
2. **Live readings,** when the question is about now.
3. **Small talk:** hello, thanks, bye, how are you.
4. **The closest written topic,** by BM25 keyword matching over each
   topic's title, answer, and the ways people ask it, after folding
   Filipino, Cebuano, and romanized Japanese words onto English (`baterya`,
   `kuryente`, `bagyo`, `denki`…). A match has to be strong, or cover at
   least half the question's words.
5. **"I don't know"** otherwise, with the nearest topics to try.

So she can't be talked into anything, can't make up a fact, and her numbers
always match the displays. It runs in the visitor's browser in well under a
millisecond, downloads nothing, and sends nothing anywhere: questions
aren't saved or shared, and are gone on reload.

The cost of that safety is range: she understands questions close to the
ones she was taught. The tests in `client/ilaw/brain.test.ts` pin what she
answers, how she declines, and which gesture each kind of answer gets.

### Teaching her

Add a topic to `client/ilaw/knowledge.ts`: a title, the answer, and several
`asks`, the ways people might put the question (in any language; varied
wording helps most). Add a `place` to let her take visitors there, or a
`card` to open an info card. Then `npm test`.

A later step, if she should understand looser wording: a small sentence
embedding model (about 23 MB), served from this Worker, loaded only when
someone first opens the chat, and run in a Web Worker so the world keeps
its frame rate. It would replace `retrieve` in `brain.ts` and leave the
guardrails and the written answers as they are.

## Layout

The same as Seizora's (see its README), plus:

```
worlds/seizorai/client/ilaw/
  knowledge.ts     Everything she knows, the exhibits' places, her
                   persona, her round, and the live readings she answers
  liveReader.ts    The live plant, as she reads it
  brain.test.ts    What she answers, how she declines, and her gestures
  Hud.tsx          The info cards and Seiza's guide chat, in the overlay
```

How she walks, answers, gestures, and chats is Seiza's (`src/guides/`).

`client/InfoCard.tsx` differs from Seizora's in one way: cards open through
a small store (`openInfo`), because the chat and the cards share the
world's one overlay.

## Build and run locally

```bash
npm install                                     # once, at the repository root
VITE_SEIZA_WORLD_ID=seizorai npm run dev        # with `npm run worker:dev` in another terminal
```

Or as deployed:

```bash
node worlds/seizorai/build.mjs
npx wrangler dev --config worlds/seizorai/wrangler.jsonc
```

## Deploy from the Cloudflare dashboard

The same steps as Seizora's README, with:

- **Project name:** `seizorai`
- **Build command:** `node worlds/seizorai/build.mjs`
- **Deploy command:** `npx wrangler deploy --config worlds/seizorai/wrangler.jsonc`
- **Non-production branch deploy command:** `npx wrangler versions upload --config worlds/seizorai/wrangler.jsonc`

Add `SEIZA_EDITOR_PASSWORD` or `SEIZA_ADMIN_KEY`, and the TURN secrets, to
this Worker under **Settings > Variables and Secrets**.
