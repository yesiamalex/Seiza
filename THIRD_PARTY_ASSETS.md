# Third-party assets

Seiza's dual license (AGPL and commercial) covers the **code**. It doesn't
necessarily cover 3D assets, such as avatars, gesture animations, and scenes,
that are added alongside the code. Assets from other sources (for example,
BOOTH) often have their own, stricter terms, and some allow only
non-commercial use. This file tracks those assets separately, so the code's
license never takes on a restriction by accident.

**Rule:** if an asset's license doesn't clearly allow redistribution, don't
commit it to this repository. Instead, add it to `scripts/fetch-assets.mjs`,
which downloads it from its original source at setup time, under the user's
own acceptance of that source's terms.

## Tracked assets

| Asset | Source | License | Commercial use | Redistributable | Notes |
|---|---|---|---|---|---|
| VRoid sample "Sakurada Fumiriya" | VRoid Studio (pixiv Inc.), via the [madjin/vrm-samples](https://github.com/madjin/vrm-samples) mirror | CC0 1.0 | Yes | Yes, but **downloaded at build time** instead of committed | `public/avatars/vroid/sakurada-fumiriya.vrm`. `scripts/fetch-assets.mjs` downscales its textures to 1024 px and changes nothing else. |
| VRoid sample "Sendagaya Shino" | Same as above | CC0 1.0 | Yes | Same as above | `public/avatars/vroid/sendagaya-shino.vrm`. Same processing. |
| VRoid "HairSample_Female" | Same as above | CC0 1.0 | Yes | Same as above | `public/avatars/vroid/sample-female.vrm`. Same processing. |
| VRoid "HairSample_Male" | Same as above | CC0 1.0 | Yes | Same as above | `public/avatars/vroid/sample-male.vrm`. Same processing. |

### About the VRoid samples

pixiv released the earlier VRoid Studio sample models under CC0. See
[VRoid help: conditions of use for sample models](https://vroid.pixiv.help/hc/en-us/articles/4402614652569-Do-VRoid-Studio-s-sample-models-come-with-conditions-of-use).
The same list is mirrored on
[OpenGameArt](https://opengameart.org/content/vroid-studio-cc0-models).

- Seiza only uses models on that CC0 list.
- **AvatarSample_A, B, and C are excluded.** They have their own conditions
  of use. Other models in the mirror that aren't on the CC0 list are also
  excluded.
- CC0 doesn't require attribution, but the in-app **Presets** tab still
  credits pixiv, states the license, and says that Seiza isn't affiliated
  with or endorsed by pixiv.
- To remove the presets, delete their entries from `defaultAvatars` in
  `world.json` and from `scripts/fetch-assets.mjs`.

## First-party generated content

These files ship with the repository but contain no external data, so the
repository's own license covers them, like the code that produces them.

| Content | Produced by | Notes |
|---|---|---|
| `public/animations/{idle,walk,run}.vrma` | `scripts/generate-motions.mjs` | Keyframes are written in the script. Regenerate with `npm run generate:motions`. |
| `public/gestures/builtin/*.vrma` | `scripts/generate-motions.mjs` | Same as above. Deployers can replace any of them; see `public/gestures/README.md`. |
| Designer avatars | `src/avatar/designer/buildDesignerVrm.ts` | Generated at runtime from settings. There are no model files. |
| The built-in hall and classroom | `src/scene/BaseEnvironment.tsx`, `layout.ts` | Generated at runtime. |
| Wood, tatami, and plaster textures | `src/scene/materials.ts` | Drawn onto a 2D canvas at startup. There are no image files. |
| Sky and lighting | `src/scene/Scene.tsx` | A procedural sky shader and lights. Seiza doesn't use an image-based environment map, because drei's `<Environment preset>` downloads an HDR file from another CDN. |

If you replace a generated clip with one from elsewhere, that clip is a
third-party asset and needs a row in the
[Tracked assets](#tracked-assets) table.

## Third-party content in documentation media

These assets appear only in screenshots or GIFs in `docs/media/`. The asset
files themselves aren't in this repository and aren't served by any
deployment.

| Media | Asset shown | Author and source | License terms that apply | Notes |
|---|---|---|---|---|
| `docs/media/hero.gif`, `docs/media/uploaded-vrm.jpg` | "Hitori 'Bocchi' Gotoh" VRM | Fan model by [@wawari_w](https://wawari.carrd.co/), of the character from *Bocchi the Rock!* (© Aki Hamaji / Houbunsha / Aniplex) | VRoid Hub license: use by everyone allowed; personal commercial use allowed; corporate commercial use **not** allowed; redistribution **not** allowed. | Captured from the maintainer's own copy for personal, illustrative use. Not an endorsement for commercial use or for forks. If you fork Seiza, consider replacing these images. Remove it on request from the model's author or the rights holders. |
| `docs/media/buttons/*.png` | Ko-fi, GitHub Sponsors, GCash, and BPI logos | Trademarks of Ko-fi Labs, GitHub, G-Xchange, and the Bank of the Philippine Islands | Used only to identify each payment option on the support buttons | The Ko-fi and GitHub Sponsors marks come from Simple Icons; the GCash and BPI marks were taken from the maintainer's own payment QR codes. |

## World content from contributors

| Content | Rights holders | Notes |
|---|---|---|
| `worlds/seisugbo/world/media/` (art and photos) | The students of the Meiji × UP arts-based research collaboration (2026), by group, and whoever took each photo | Shown in the Seisugbo world for the project. A deployer should confirm the makers, and anyone recognizable in the photos, agree to a public deployment. Not covered by the repository's AGPL license: don't reuse them outside a Seisugbo deployment without asking. Remove any piece on request. The originals aren't committed (`media-src/` is gitignored); `scripts/optimize-media.mjs` makes these small copies and strips their metadata, GPS included. |

## Add a new asset

1. Record the source URL, the exact license, and whether the license allows
   commercial use and redistribution.
2. If the asset is redistributable, add the file under `public/` or
   `assets/`, and add a row to the [Tracked assets](#tracked-assets) table.
3. If it isn't redistributable, or you aren't sure, add a download step to
   `scripts/fetch-assets.mjs` that points at the original source.

A pull request that adds an asset without a completed row in this file isn't
merged. See `CONTRIBUTING.md`.

## Add preset avatars

The built-in avatar designer already offers businessman, businesswoman,
casual, student, and creative presets, with no files. This section is for
deployers who also want real `.vrm` models.

The `defaultAvatars` array in `world.json` fills the **Presets** tab on the
join screen and in the in-world Avatar menu. The default world lists four
CC0 VRoid Studio samples (see [Tracked assets](#tracked-assets)), which
`scripts/fetch-assets.mjs` downloads and shrinks at build time instead of
committing them. Each entry can include `author`, `license`, and
`licenseUrl`, which appear as a credit line under the presets.

Sources of more CC0 avatars:

| Source | Notes |
|---|---|
| [VRoid Studio sample models](https://vroid.com/en/studio) | Released under CC0 by pixiv, and free to edit and redistribute. A good starting point for your own variants in VRoid Studio. |
| [Open Source Avatars](https://www.opensourceavatars.com/) ([registry](https://github.com/ToxSam/open-source-avatars)) | More than 300 CC0 VRM avatars. Each avatar's license is listed in the registry's `projects.json`. Check the individual entry, not only the collection's description. |
| [MJMoonbow/VRMavatars](https://github.com/MJMoonbow/VRMavatars) | A collection published under CC0. |

To add your own:

1. Add the `.vrm` files. Either:
   - Add them to `scripts/fetch-assets.mjs`, so `npm run fetch-assets`
     downloads them at setup time (recommended, because it keeps binaries
     out of the repository), or
   - Put them in `public/avatars/`.
2. List them in your world configuration:

   ```jsonc
   "defaultAvatars": [
     { "label": "Businessman", "url": "/avatars/businessman.vrm" },
     { "label": "Businesswoman", "url": "/avatars/businesswoman.vrm" },
     { "label": "Casual", "url": "/avatars/casual.vrm" }
   ]
   ```

3. Add a row to the [Tracked assets](#tracked-assets) table with the exact
   source and license of each file.

Confirm the license of each model you download. "The collection is CC0" and
"this avatar in it is CC0" aren't always the same.

## User-uploaded avatars

Anyone who joins a deployment can upload their own `.vrm` avatar with the
avatar chooser (`src/ui/AvatarChooser.tsx`), on the join screen or in the
in-world Avatar menu. `worker/index.ts` stores it in that deployment's own
Cloudflare KV namespace, and it's deleted automatically after 30 days.

Uploaded avatars are different from the assets tracked above:

- **The uploader is responsible** for having the rights to the file, not the
  maintainers or the deployer. The upload form requires the uploader to
  confirm that they have the rights to use and share the file.
- **They aren't reviewed or license-checked** by this project or by the
  deployer. To turn off uploads, set `allowAvatarUpload: false` in
  `world.json`.
- **They aren't part of this repository.** They're temporary content in the
  deployer's own Cloudflare account, and this file doesn't track them.
