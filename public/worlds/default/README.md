This folder intentionally ships without `scene.glb` or a bundled `.vrm` avatar.

Per THIRD_PARTY_ASSETS.md, 3D assets (scenes, avatars, gesture animations) are
not bundled in this repository by default — license terms on found/downloaded
assets vary, and several likely candidates for seiza/ojigi gestures are
non-commercial-only. Supply your own:

- `scene.glb` — any glTF 2.0 scene
- default avatar — set `defaultAvatarUrl` in `world.json` to a `.vrm` file
  you have the rights to use (host it here, or point at a URL)
- gesture clips — see `src/avatar/gestures.ts` for where to register `.vrma`
  files per gesture name

The app renders a clear placeholder state if `scene.glb` or the default
avatar is missing, rather than failing silently — see `Scene.tsx`.
