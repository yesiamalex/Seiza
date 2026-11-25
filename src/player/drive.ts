/**
 * Riding (src/addons/exer): how much faster than walking this visitor
 * moves, set every frame from their ride and the slope under it, and a
 * speed to roll forward at with no input (a smart trainer's), in m/s.
 * PlayerRig reads both on a flat screen; in a headset the ride's own layer
 * moves the playspace. On foot: 1 and 0.
 */
export const drive = { scale: 1, cruise: 0, heat: 1, swim: 1, ease: 0 };
// ease: on a ride, how quickly speed builds and fades, per second (its
// VehicleSpec.ease); 0 on foot, where you start and stop at once.
// swim: SWIM_SPEED while swimming at the beach (src/avatar/SwimLayer.tsx), else 1.
/** How fast a swimmer goes, as a share of walking. */
export const SWIM_SPEED = 0.45;
// heat: how much a long walk in the heat has slowed this visitor
// (src/avatar/heat.ts), 1 when it hasn't.
