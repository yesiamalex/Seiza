/**
 * Riding (src/addons/exer): how much faster than walking this visitor
 * moves, set every frame from their ride and the slope under it, and a
 * speed to roll forward at with no input (a smart trainer's), in m/s.
 * PlayerRig reads both on a flat screen; in a headset the ride's own layer
 * moves the playspace. On foot: 1 and 0.
 */
export const drive = { scale: 1, cruise: 0, heat: 1 };
// heat: how much a long walk in the heat has slowed this visitor
// (src/avatar/heat.ts), 1 when it hasn't.
