# Room modes

Add-ons an editor or admin switches on for a whole room. While a mode is on,
everyone gets its button in the bar. When it's off, nothing of it runs and
its events don't pass the room server. Player-facing details are in DOCS.md,
under "Room modes".

```
index.tsx    What App mounts: AddonScene (in the Canvas), AddonBarButtons,
             AddonOverlay, RoomModes (the switches). Nothing else.
bus.ts       The mode's events: sent on the room socket as `addon`,
             relayed by the server as `addonEvent`, unread and unstored.
avatars.ts   Every loaded avatar by player id, for putting things in hands.
rig.ts       Hand poses through the VR arm IK (src/xr/body/bodyIk.ts), and
             props held in a hand or worn on the chest.
body.ts      The rest of the body: hips that drop and shift, a spine that
             turns and bends, feet that step (the same leg IK), a nodding
             head. Posed before the hands, which reach from where the
             shoulders went. The walk keeps the legs while walking.
store.ts     A tiny store shared by the HUD and the 3D scene.
sound.ts     Synthesized sound through the world sounds' output (and mute).
ui.tsx       The coloured mode button, choice chips, the switch.
fantasy/     Weapons, health, swings and specials; blade contact
             (contact.ts) for hits and parries; each weapon's set of cuts,
             a pole's (naginata, scythe) own rest and guard, each
             element's special move, and the bow's shots, hands and body
             (poses.ts); each element's burst and wind-up, pooled lights,
             arrows and rod bolts that land on what they reach
             (effects.ts); each element's sounds (sounds.ts); the
             necromancer's undead (undead.ts); your record (record.ts).
band/        Instruments (synthesized: pad, kit, taiko, keys, kulintang
             gongs, acoustic, lead through an amp and cabinet, bass, and
             shaker; single strings picked from a chord), one or two
             light sticks, touch play in VR; how each instrument's player
             grooves (moves.ts).

Both modes pose an avatar through the overlay VR tracking uses, shared
(`sharedOverlay` in ../xr/body/bodyIk.ts), so nothing one leaves on the
bones outlives it. Only one is in your hands at a time (index.tsx), and in
a headset both offer their choices in the wrist menu
(`useAddonXrSections`).
```

## How it hooks in

The rest of Seiza knows about this folder in a few places:

- `src/multiplayer/types.ts`: the `addon`/`addonEvent` messages,
  `ADDON_MODES`, and the `mode.<name>` world-state key.
- `worker/room.ts`: relays an `addon` event only while the world state holds
  `mode.<name> = true`. Events are capped at 512 characters and 12 a second.
- `src/multiplayer/useRoomSocket.ts`: hands `addonEvent` to `bus.ts`.
- `src/App.tsx`, `src/multiplayer/RemotePlayers.tsx`: register avatars and
  mount the four parts.
- `src/edit/EditToolbar.tsx`, `src/admin/AdminButton.tsx`: hold the
  switches as children.
- `src/audio/sfx.ts`: `sfxOutput()`.
- `src/player/selfPush.ts`, spent by `src/player/PlayerRig.tsx` before its
  walls: a fighter's lunges and knockbacks (never in VR).
- `src/xr/body/bodyIk.ts`: `solveTwoBone` and `setWorldQuaternion`, shared
  with the VR body.

## Adding a mode

1. Add its name to `ADDON_MODES` in `src/multiplayer/types.ts`, and to
   `deliverAddonEvent`'s check in `bus.ts`.
2. Give it a folder here, with a scene layer and a HUD part.
3. Mount them in `index.tsx`, and add a switch to `RoomModes`.

Every event comes from another browser. Read each field with the helpers in
`bus.ts`, and check it before use.
