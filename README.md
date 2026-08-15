# Seiza

A serverless, deployer-owned reference architecture for self-hostable,
standards-based multiplayer WebXR. No central server the maintainers
operate — every deployment runs entirely on the deployer's own Cloudflare
account.

Full technical writeup: `seiza_paper_draft.md` (draft, targeting a
Japanese XR conference, April 2027).

## Deploy your own instance

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=REPLACE_WITH_THIS_REPO_URL)

Clicking this clones the repo into **your own** GitHub account and
provisions everything into **your own** Cloudflare account — nothing
touches infrastructure the maintainers run. See the architecture note in
`wrangler.jsonc` for the current open question about unifying the
frontend Worker and the PartyKit room server behind this one button;
until that's resolved, you may need a second step (`npm run
party:deploy`) after clicking through.

## Local development

```bash
npm install
cp .env.example .env.local     # then edit as needed
npm run party:dev              # realtime room server, separate terminal
npm run dev                    # frontend
```

Open the dev server URL. On first run, expect a wireframe placeholder
floor and a console error about the missing default avatar — that's
correct, not broken. See `public/worlds/default/README.md` for why 3D
assets aren't bundled, and `THIRD_PARTY_ASSETS.md` before adding any.

## Customizing a deployment ("one world per deployment")

Fork, edit `public/worlds/<your-id>/world.json`, set
`VITE_SEIZA_WORLD_ID` to match. No application code changes needed —
see `src/config/worldConfig.ts`.

## Project layout

```
src/            frontend (React Three Fiber + WebXR + VRM)
  avatar/       VRM loading, VRMA gesture playback
  multiplayer/  realtime client, remote-player rendering
  voice/        Cloudflare Realtime SFU integration point (stub — see file)
  interactions/ pedagogical interaction modules (gesture-match game, more TBD)
party/          realtime room server (PartyKit / Durable Objects)
public/worlds/  per-deployment world configs — the customization surface
scripts/        setup-time asset fetching for non-bundled, license-restricted assets
```

## Licensing

Dual-licensed: **AGPL-3.0-or-later** (`LICENSE`) for open/self-hosted
use, or a **commercial license** (`COMMERCIAL-LICENSE.md`) for
proprietary/closed use. Contributions require a CLA before merge — see
`CONTRIBUTING.md`. 3D assets are licensed separately from the code — see
`THIRD_PARTY_ASSETS.md`.

## Status

Early scaffold, not yet production-tested. Local movement/locomotion,
voice, and load-tested multiplayer sync are all explicitly unfinished —
see the paper draft's Limitations section (Section 7) for the honest
current state.
