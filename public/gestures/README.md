# Gesture clips

Seiza plays gestures from **VRM Animation** (`.vrma`) files. A `.vrma` clip
animates the VRM **humanoid** bones (`hips`, `spine`, `upperArm`, and so on)
rather than one model's own skeleton. As a result, one clip works on every
avatar in a room: an uploaded VRM 0.x or 1.0 file, a deployment preset, or a
designer avatar. `@pixiv/three-vrm-animation` retargets the clip when it
loads.

```
public/gestures/
  builtin/   Generated clips that ship with Seiza (don't edit by hand)
  custom/    Your deployment's own clips (create this folder)
```

## Built-in gestures

`scripts/generate-motions.mjs` writes `builtin/*.vrma` and
`public/animations/{idle,walk,run}.vrma`. The keyframes are written in that
script, so the clips contain no third-party motion data and are covered by
this repository's license (see `THIRD_PARTY_ASSETS.md`).

To change a motion, edit the script and run:

```bash
npm run generate:motions
```

This also rewrites `src/avatar/builtinMotions.generated.ts`, the manifest from
which the app reads each clip's name, label, duration, and full-body flag.

| Key | Name | Label | Body | Type |
|---|---|---|---|---|
| `1` | `wave` | Wave | Upper | One-shot |
| `2` | `bow` | Bow (ojigi) | Upper | One-shot |
| `3` | `seiza` | Seiza (hold) | Full | Hold, toggle |
| `4` | `nod` | Nod | Upper | One-shot |
| `5` | `clap` | Clap | Upper | One-shot |
| `6` | `cheer` | Cheer | Upper | One-shot |
| `7` | `shrug` | Shrug | Upper | One-shot |
| `8` | `point` | Point | Upper | One-shot |
| `9` | `gassho` | Gasshō (thanks) | Upper | One-shot |
| `0` | `raisehand` | Raise hand (hold) | Upper | Hold |
| None | `sit` | Sit | Full | Hold, hidden |
| None | `handshake` | Handshake | Upper | One-shot, hidden, together |
| None | `highfive` | High five | Upper | One-shot, hidden, together |
| None | `hug` | Hug | Upper | One-shot, hidden, together |

The three **together** gestures are played by two people at once, and only
after the other person says yes; the room server refuses them otherwise.
They're asked for from the Together section of the Gestures menu, not played
from the menu like the rest. See "Together gestures" in DOCS.md.

Upper-body gestures play on top of walking, so you can wave while you move.
Full-body gestures also control the legs, and replace walking while they
play.

### Hold clips

A **hold** clip ends on the pose it keeps and stays there instead of playing
through. How it's released depends on which part of the body it controls:

- **Upper-body hold** (the raised hand): lasts while you hold its key or
  button, and ends when you let go.
- **Full-body hold**: a **posture**. Its key toggles it, so seiza stays until
  you press `3` again or move. Sitting works the same way, but you start it
  by clicking a chair instead of pressing a key.

Postures are tracked separately from gestures on the network. This lets a
seated or kneeling player wave without standing up on everyone else's
screen.

### Hidden clips

A **hidden** clip never appears in the menu or on the number keys, because
something else triggers it. For example, `sit` plays when a player clicks a
chair.

If you replace `sit` with your own clip, it changes how everyone sits in your
world. In the final pose, keep the hips' drop equal to `SEAT_HEIGHT` in
`src/scene/layout.ts` (0.45 m), or avatars float above the chairs or sink into
them.

## Add your own gestures

1. Put the clip in `public/gestures/custom/`, for example
   `public/gestures/custom/salute.vrma`.
2. Register it in your world configuration (`public/worlds/<id>/world.json`):

   ```json
   "customGestures": [
     { "name": "salute", "label": "Salute", "url": "/gestures/custom/salute.vrma" },
     { "name": "bow", "label": "Deep bow", "url": "/gestures/custom/deep-bow.vrma" },
     { "name": "dance", "label": "Dance", "url": "/gestures/custom/dance.vrma", "fullBody": true },
     { "name": "salute_hold", "label": "Salute (hold)", "url": "/gestures/custom/salute-hold.vrma", "hold": true }
   ]
   ```

3. Record the clip's source and license in `THIRD_PARTY_ASSETS.md`.

`src/avatar/gestures.ts` enforces these rules:

| Field or case | Rule |
|---|---|
| Same `name` as a built-in | Replaces the built-in. In the example, `bow` replaces the built-in bow. The gesture menu lists it under **Custom for this world** and marks it as a replacement. |
| Any other `name` | Adds a new gesture next to the built-ins. |
| `name` format | Lowercase letters, digits, `-`, or `_`, up to 32 characters. The room server checks the same format before relaying a gesture. |
| `url` | A same-origin path or an `https://` URL. |
| `fullBody: true` | For clips that move the legs, such as sitting, kneeling, or dancing. Leave it out for arm, head, and torso gestures. |
| `hold: true` | For a pose that stays until released. Make the clip's last frame that pose, because that's the frame it holds. With `fullBody: true`, the clip becomes a posture, toggled by its key. |
| `enabledGestures` | To hide some built-in gestures, list the ones to keep. Custom gestures are always shown. |

Everyone in a room loads the same `world.json`, so a custom gesture plays the
same clip for everyone.

## Create a `.vrma` file

- **Blender:** the VRM Add-on for Blender can import a VRM, animate its
  humanoid rig, and export VRM Animation.
- **Motion capture (BVH):** convert the file with a BVH-to-VRMA tool, then
  trim it in Blender.
- **Code:** follow the approach in `scripts/generate-motions.mjs`.

### Authoring tips

- **Keep clips short, and don't loop them.** The app blends in and out over a
  fraction of a second, so a one-shot clip should start and end near a
  relaxed standing pose. A clip that ends mid-motion snaps back visibly. A
  `hold` clip should end exactly on the pose it keeps.
- **Other tracks are optional.** Clips can animate `expressions` or `lookAt`,
  but only humanoid bone tracks are required.
- **Check the palms.** The forearm's X rotation rolls the wrist, and it
  decides whether a wave or shrug looks right or the hand looks backward. On
  a left arm at rest, -90 turns the palm forward, 0 faces it toward the
  thigh, and +90 turns it backward. The right forearm is mirrored. The
  built-in clips set these angles from measurements on a real rig; see the
  notes at the top of `scripts/generate-motions.mjs`.
- **Test on both VRM versions.** Try each new clip on a VRM 0.x and a VRM 1.0
  avatar. The two formats use mirrored axes, and three-vrm only corrects for
  that automatically when the clip is valid VRMA.
