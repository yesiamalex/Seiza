This folder intentionally ships without a `scene.glb` or a bundled default
`.vrm` avatar.

Per `THIRD_PARTY_ASSETS.md`, 3D assets (scenes, avatars, gesture
animations) are not bundled in this repository by default — license terms
on found/downloaded assets vary, and several likely candidates for
seiza/ojigi gestures are non-commercial-only. That's fine, because:

- **The room itself isn't blank.** `src/scene/BaseEnvironment.tsx` builds
  a real, walkable space (floor, walls with doorways, pillars, a
  semicircle of benches) entirely from code — no licensing question,
  since nothing is a downloaded asset. If you want a custom space
  instead, set `sceneUrl` in `world.json` to any glTF 2.0 file; it
  renders layered over (in front of) the base environment. If that file
  is missing or fails to load, the app quietly falls back to just the
  base environment rather than crashing (see `Scene.tsx`).
- **Avatars are supplied by whoever joins.** The join screen lets each
  person upload their own `.vrm` (see `src/ui/JoinScreen.tsx` and
  `worker/index.ts`) — set `allowAvatarUpload: false` in `world.json` to
  turn that off for a given deployment. `defaultAvatarUrl` is still the
  fallback for anyone who skips uploading; if that file doesn't exist
  either, `VrmAvatar.tsx` shows a plain capsule placeholder instead of
  making the player invisible.
- Gesture clips — see `src/avatar/gestures.ts` for where to register
  `.vrma` files per gesture name; still not bundled, same licensing
  reasoning.
