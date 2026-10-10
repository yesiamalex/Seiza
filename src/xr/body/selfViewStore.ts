import * as THREE from "three";

/**
 * Where your own avatar's eyes are this frame, for the flat-screen
 * first-person camera: SelfView measures it, PlayerRig puts the camera
 * there. Plain module state for the same reason trackingStore is — it's
 * written and read once a frame from frame loops.
 */
export const selfViewStore = {
  /** True once an avatar is measured; the camera falls back to the
   *  player's fixed eye height until then. */
  valid: false,
  /** Between the eyes, in the space of the group the avatar is drawn in,
   *  so PlayerRig can place it with this frame's position and facing. */
  eye: new THREE.Vector3(),
  /** How the head is turned by animation, in that same space: a bow, a
   *  nod, a head shake, a glance toward a pointing hand. The camera turns
   *  with it on top of where the player is looking. Identity when the head
   *  is only idling. */
  turn: new THREE.Quaternion(),
};
