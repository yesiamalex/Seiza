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
| VRoid sample "Sakurada Fumiriya" | VRoid Studio (pixiv Inc.), via the [madjin/vrm-samples](https://github.com/madjin/vrm-samples) mirror | CC0 1.0 | Yes | Yes, but **fetched at build** rather than committed | `public/avatars/vroid/sakurada-fumiriya.vrm`. Textures downscaled to 1024px by `scripts/fetch-assets.mjs`; nothing else changed. |
| VRoid sample "Sendagaya Shino" | Same | CC0 1.0 | Yes | Same | `public/avatars/vroid/sendagaya-shino.vrm`, same processing. |
| VRoid "HairSample_Female" | Same | CC0 1.0 | Yes | Same | `public/avatars/vroid/sample-female.vrm`, same processing. |
| VRoid "HairSample_Male" | Same | CC0 1.0 | Yes | Same | `public/avatars/vroid/sample-male.vrm`, same processing. |

**About the VRoid samples.** pixiv released VRoid Studio's earlier sample
models under CC0 ([VRoid help: conditions of use for sample models](https://vroid.pixiv.help/hc/en-us/articles/4402614652569-Do-VRoid-Studio-s-sample-models-come-with-conditions-of-use);
the same list is mirrored on [OpenGameArt](https://opengameart.org/content/vroid-studio-cc0-models)).
Only models on that CC0 list are used. **AvatarSample_A, B and C are not**:
they carry their own conditions of use and are deliberately excluded, as
are the other models in the mirror that aren't on the CC0 list. CC0 needs
no attribution, but the in-app Presets tab credits pixiv and states the
license anyway, and that Seiza isn't affiliated with or endorsed by them.
To drop the presets, remove their entries from `world.json`'s
`defaultAvatars` and from `scripts/fetch-assets.mjs`.

### First-party generated content (not third-party)

These ship with the repository but contain no external data, so they are
covered by the repository's own license like the code that produces them.

| Content | Produced by | Notes |
|---|---|---|
| `public/animations/{idle,walk,run}.vrma` | `scripts/generate-motions.mjs` | Keyframes authored in the script. Regenerate with `npm run generate:motions`. |
| `public/gestures/builtin/*.vrma` | `scripts/generate-motions.mjs` | Same as above. Deployers can replace any of them; see `public/gestures/README.md`. |
| Designer avatars | `src/avatar/designer/buildDesignerVrm.ts` | Geometry is generated at runtime from settings. No model files exist. |
| The built-in hall and classroom | `src/scene/BaseEnvironment.tsx`, `layout.ts` | Geometry generated at runtime. |
| Wood, tatami and plaster textures | `src/scene/materials.ts` | Drawn onto a 2D canvas at startup, not image files. |
| Sky and lighting | `src/scene/Scene.tsx` | A procedural sky shader plus lights. Deliberately not an image-based environment map: drei's `<Environment preset>` downloads an HDR from a third-party CDN. |

If you replace a generated clip with a clip from elsewhere, that clip is a
third-party asset and needs a row in the table above.

## Adding a new asset

1. Record the source URL, exact license, and whether it permits
   commercial use and redistribution.
2. If redistributable: add the file under `public/` or `assets/` and add
   a row above.
3. If not redistributable (or unclear): add a fetch step to
   `scripts/fetch-assets.mjs` instead, pointing at the original source.
4. Either way, a PR adding an asset without a completed row here should
   not be merged (see `CONTRIBUTING.md`).

## Adding default avatars (businessman / businesswoman / casual, etc.)

The built-in avatar designer already offers businessman, businesswoman,
casual, student, and creative presets with no files at all. This section is
for deployers who also want real `.vrm` models.

`world.json`'s `defaultAvatars` array powers the "Presets" tab on the join
screen and in the in-world avatar menu. The default world lists four CC0
VRoid Studio samples (see the table at the top), downloaded and shrunk at
build time by `scripts/fetch-assets.mjs` rather than committed. Each entry
can carry `author`, `license` and `licenseUrl`, shown as a credit line
under the presets.

More CC0 avatars, if you want to add your own:

| Source | Notes |
|---|---|
| [VRoid Studio sample models](https://vroid.com/en/studio) | Released CC0 by Pixiv; editable and redistributable. Good base for making your own businessman/casual variants in VRoid Studio itself. |
| [Open Source Avatars](https://www.opensourceavatars.com/) ([registry](https://github.com/ToxSam/open-source-avatars)) | 300+ CC0 VRM avatars. Per-avatar licenses are listed in the registry's `projects.json` — check the individual entry, not just the collection blurb. |
| [MJMoonbow/VRMavatars](https://github.com/MJMoonbow/VRMavatars) | Collection published as CC0. |

To wire them up:

1. Put the `.vrm` files in `public/avatars/` (or add them to
   `scripts/fetch-assets.mjs` so `npm run fetch-assets` pulls them at
   setup time instead of committing binaries — the preferred route, and
   why that script exists).
2. List them in your world config:
   ```jsonc
   "defaultAvatars": [
     { "label": "Businessman", "url": "/avatars/businessman.vrm" },
     { "label": "Businesswoman", "url": "/avatars/businesswoman.vrm" },
     { "label": "Casual", "url": "/avatars/casual.vrm" }
   ]
   ```
3. Add a row to the table at the top of this file recording the exact
   source and license for each file you added.

Confirm the license on the specific model you download. "The collection
is CC0" and "this particular avatar in it is CC0" are not automatically
the same claim.

## User-uploaded avatars (not covered by the table above)

The avatar chooser (`src/ui/AvatarChooser.tsx`, on the join screen and in
the in-world avatar menu) lets anyone joining a deployment upload their own
`.vrm` avatar, stored via `worker/index.ts`
into that deployment's own Cloudflare KV namespace, auto-expiring after
30 days. This is fundamentally different from the assets tracked above:

- It's **the uploader's responsibility**, not the maintainers' or a given
  deployer's, to have the rights to the file they upload — the upload
  form requires an explicit "I have the rights to use/share this" 
  confirmation before it will submit.
- It is **not curated or license-checked** by this project or by
  whoever's running the deployment. A deployer who wants to disable
  uploads entirely can set `allowAvatarUpload: false` in their
  `world.json`.
- Uploaded files are ephemeral, per-deployment content living in that
  deployer's own Cloudflare account — they are not part of this
  repository and this table does not track them.
