# Gesture clips

Seiza plays gestures from **VRM Animation** (`.vrma`) files. A `.vrma` clip
animates the VRM *humanoid* bones (hips, spine, upperArm, …) rather than any
one model's skeleton, so a single clip works on every avatar in a room: an
uploaded VRM 0.x or 1.0 file, a deployment preset, or a designer avatar.
Retargeting is done by `@pixiv/three-vrm-animation` at load time.

```
public/gestures/
  builtin/   generated clips that ship with Seiza (do not edit by hand)
  custom/    your deployment's own clips (create this folder)
```

## Built-in gestures

`builtin/*.vrma` and `public/animations/{idle,walk,run}.vrma` are written by
`scripts/generate-motions.mjs`. The keyframes are authored in that script, so
there is no third-party motion data and the clips are covered by this
repository's license (see `THIRD_PARTY_ASSETS.md`). To change a motion, edit
the script and run:

```bash
npm run generate:motions
```

That also rewrites `src/avatar/builtinMotions.generated.ts`, the manifest the
app reads names, labels, durations, and the full-body flag from.

| Key | Name | Label | Body | Kind |
|---|---|---|---|---|
| 1 | `wave` | Wave | upper | one-shot |
| 2 | `bow` | Bow (ojigi) | upper | one-shot |
| 3 | `seiza` | Seiza (formal kneel) | full | one-shot |
| 4 | `nod` | Nod | upper | one-shot |
| 5 | `clap` | Clap | upper | one-shot |
| 6 | `cheer` | Cheer | upper | one-shot |
| 7 | `shrug` | Shrug | upper | one-shot |
| 8 | `point` | Point | upper | one-shot |
| 9 | `gassho` | Gasshō (thanks) | upper | one-shot |
| 0 | `raisehand` | Raise hand (hold) | upper | hold |
| — | `sit` | Sit | full | hold, hidden |

Upper-body gestures layer over walking, so you can wave while moving. Full-body
gestures also drive the legs and take over from walking while they play.

A **hold** clip ends on the pose it should keep and stays there until the key
or button is released, instead of playing through or looping. A **hidden**
clip is triggered by the app rather than the menu: `sit` is played when a
player clicks a chair, and sitting is tracked as a posture, so a seated
player who waves stays seated.

Replacing `sit` with your own clip changes how everyone sits in your world.
Keep the hips drop in the final pose equal to `SEAT_HEIGHT` in
`src/scene/layout.ts` (0.45m), or avatars will float above the chairs or sink
into them.

## Adding your own

1. Put the clip in `public/gestures/custom/`, for example
   `public/gestures/custom/salute.vrma`.
2. Register it in your world config (`public/worlds/<id>/world.json`):

   ```json
   "customGestures": [
     { "name": "salute", "label": "Salute", "url": "/gestures/custom/salute.vrma" },
     { "name": "bow", "label": "Deep bow", "url": "/gestures/custom/deep-bow.vrma" },
     { "name": "dance", "label": "Dance", "url": "/gestures/custom/dance.vrma", "fullBody": true },
     { "name": "salute_hold", "label": "Salute (hold)", "url": "/gestures/custom/salute-hold.vrma", "hold": true }
   ]
   ```

3. Record the clip's source and license in `THIRD_PARTY_ASSETS.md`.

Rules, enforced in `src/avatar/gestures.ts`:

- **Same name as a built-in replaces it.** Above, `bow` swaps the built-in
  bow for your clip. The gesture menu lists it under "Custom for this world"
  and marks it as replacing the built-in.
- **Any other name is added** alongside the built-ins.
- `name` is lowercase letters, digits, `-` or `_`, up to 32 characters. The
  room server checks the same shape before relaying a gesture.
- `url` must be a same-origin path or an `https://` URL.
- `fullBody: true` for clips that move the legs (sitting, kneeling, dancing).
  Leave it out for arm, head, and torso gestures.
- `hold: true` for a pose that should stay until released. Author the clip so
  its last frame *is* that pose, since that's the frame it holds.
- To hide some built-ins, list the ones to keep in `enabledGestures`. Custom
  gestures are always shown.

Everyone in a room loads the same `world.json`, so a custom gesture resolves
to the same clip for every client.

## Making a `.vrma`

- **Blender:** the VRM Add-on for Blender can import a VRM, animate its
  humanoid rig, and export VRM Animation.
- **Motion capture (BVH):** convert with a BVH-to-VRMA tool, then trim in
  Blender.
- **Code:** copy the approach in `scripts/generate-motions.mjs`.

Keep clips short and not looping. A one-shot should start and end near a
relaxed standing pose, because the app blends in and out over a fraction of a
second and a clip that ends mid-motion will visibly snap back; a `hold` clip
should instead end exactly on the pose it keeps. Clips that animate
`expressions` or `lookAt` are fine; only humanoid bone tracks are required.

Test a new clip on both a VRM 0.x and a VRM 1.0 avatar. The two formats use
mirrored axis conventions, and three-vrm corrects for that automatically only
when the clip itself is valid VRMA.
