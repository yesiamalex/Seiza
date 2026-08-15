# Third-Party Assets

The AGPL/commercial dual-license in this repo covers the **code**, not
necessarily any 3D assets (avatars, gesture animations, scenes) added
alongside it. Assets sourced externally (e.g. from BOOTH) commonly carry
their own, more restrictive terms — some non-commercial-only. Tracking
them here, separately, keeps the code license from silently inheriting a
restriction it shouldn't have.

**Rule: if an asset's license doesn't clearly permit redistribution, it
does not get committed to this repo.** Reference it in
`scripts/fetch-assets.mjs` instead, so it's downloaded at setup time from
its original source, under the user's own acceptance of that source's
terms.

| Asset | Source | License | Commercial use OK? | Redistributable in this repo? | Notes |
|---|---|---|---|---|---|
| _(none bundled yet — see `public/worlds/default/README.md`)_ | | | | | |

## Adding a new asset

1. Record the source URL, exact license, and whether it permits
   commercial use and redistribution.
2. If redistributable: add the file under `public/` or `assets/` and add
   a row above.
3. If not redistributable (or unclear): add a fetch step to
   `scripts/fetch-assets.mjs` instead, pointing at the original source.
4. Either way, a PR adding an asset without a completed row here should
   not be merged (see `CONTRIBUTING.md`).
