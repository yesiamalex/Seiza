# Default world

This folder holds the default world's configuration. It intentionally
doesn't include a `scene.glb` file or any committed `.vrm` files.

Following `THIRD_PARTY_ASSETS.md`, third-party 3D assets are only committed
when their license clearly allows redistribution. This world doesn't need
any:

- **The world is built in code.** `src/scene/BaseEnvironment.tsx` builds two
  connected rooms: a hall with benches around a tatami platform, a reception
  desk, planters, and paper lanterns; and, through a corridor of shoe
  lockers, a classroom with desks, a chalkboard, and a wall of windows.
  Outside is a garden with a pond. You can sit on every chair and bench by
  clicking it.

  The floor plan is in `src/scene/layout.ts`, which also lists the furniture
  that blocks movement. The tatami platform is a real step up. The wood,
  tatami, and plaster textures are drawn on a canvas at startup, so there's
  nothing to download or license.

  To use your own space, set `sceneUrl` in `world.json` to any glTF 2.0 file.
  If it fails to load, the app falls back to the built-in rooms.
- **Everyone gets an avatar.** Because `defaultAvatarUrl` is empty, a
  first-time visitor starts with the designer's default look. They can pick a
  designer preset (businessman, businesswoman, casual, student, or creative),
  customize one, choose a VRM preset, or upload their own `.vrm` file.
  Designer avatars are generated in code, so there's no file to license.

  The VRM presets listed in `defaultAvatars` are CC0 VRoid Studio samples,
  downloaded and shrunk at build time by `scripts/fetch-assets.mjs` instead
  of committed. See `THIRD_PARTY_ASSETS.md` for their licenses, and for more
  CC0 sources. If a model fails to load, `VrmAvatar.tsx` shows a plain
  placeholder instead of an invisible player.
- **Gestures and movement are built in.** `scripts/generate-motions.mjs`
  generates the idle, walk, run, and gesture clips, including the held poses
  for a raised hand and for sitting. To add or replace gestures, use
  `customGestures`; see `public/gestures/README.md`.

## `world.json` fields

| Field | Description |
|---|---|
| `id` | Room ID. Must match this folder's name and `VITE_SEIZA_WORLD_ID`. |
| `displayName` | Shown on the join screen and in the HUD. |
| `sceneUrl` | Optional. A glTF environment that replaces the built-in rooms. |
| `environmentCollision` | Optional. Set to `false` to stop `sceneUrl` environments from blocking movement. Defaults to `true`. |
| `sky` | Optional. `{ "cycle": "realtime", "site", "weather", "timeScale"? }` moves the sky with Philippine time and a shared weather schedule; `"cycle": "fixed"`, or leaving it out, keeps the still sunset. See DOCS.md, "Sky and weather". |
| `spawnPoint` | Where players appear, as `{ "x", "y", "z" }`. |
| `defaultAvatarUrl` | A `.vrm` URL for first-time visitors, or `""` for the designer's default look. |
| `defaultAvatars` | Optional `.vrm` presets: `[{ "label", "url", "author"?, "license"?, "licenseUrl"? }]`. The optional fields appear as a credit line. |
| `enabledGestures` | Optional. A list of built-in gesture names to offer. Leave it out to offer all of them. |
| `customGestures` | Optional `.vrma` clips: `[{ "name", "label", "url", "fullBody"?, "hold"? }]`. See `public/gestures/README.md`. |
| `defaultObjects` | Optional. Objects the world starts with, such as notice boards, notes, and screens. They're placed once, by the first person to enter an empty room. |
| `maxOccupants` | A hint for the client. The server's limit is `SEIZA_MAX_OCCUPANTS`. |
| `voiceEnabled` | Whether to show voice chat controls. |
| `editingEnabled` | Whether Edit Mode is allowed. |
| `allowAvatarUpload` | Whether `.vrm` uploads are allowed. |
