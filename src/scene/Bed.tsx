import { getWorldMaterials, type WorldMaterials } from "./materials";
import { BED } from "./layout";

/**
 * A bed, placed in Edit Mode (src/edit/WorldObjects.tsx) and lain on like
 * the sleeping bag in the campsite's tent (placedBedSeat in layout.ts,
 * which has to agree with these proportions: the hips go on its top).
 *
 * Local space: the pillow is at +Z, so whoever lies in it faces -Z, the
 * way a sitter faces in a chair.
 */
export function Bed({ m = getWorldMaterials() }: { m?: WorldMaterials }) {
  const { length, width, top, pillowZ } = BED;
  const mattress = 0.18;
  return (
    <group>
      {/* Frame and legs. */}
      <mesh position={[0, top - mattress - 0.06, 0]} material={m.furnitureWarm} castShadow receiveShadow>
        <boxGeometry args={[width + 0.06, 0.12, length + 0.06]} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * width * 0.46, (top - mattress - 0.12) / 2, sz * length * 0.47]} material={m.furnitureWarm}>
            <boxGeometry args={[0.07, top - mattress - 0.12, 0.07]} />
          </mesh>
        ))
      )}
      {/* The headboard, behind the pillow. */}
      <mesh position={[0, top + 0.16, length / 2 + 0.03]} material={m.furnitureWarm} castShadow>
        <boxGeometry args={[width + 0.06, 0.62, 0.05]} />
      </mesh>
      <mesh position={[0, top - mattress / 2, 0]} material={m.paper} castShadow receiveShadow>
        <boxGeometry args={[width, mattress, length]} />
      </mesh>
      {/* A blanket over the foot of it, and the pillow. */}
      <mesh position={[0, top + 0.012, -length * 0.16]} material={m.accentBlue} receiveShadow>
        <boxGeometry args={[width + 0.03, 0.03, length * 0.66]} />
      </mesh>
      <mesh position={[0, top + 0.05, pillowZ]} material={m.paper} castShadow>
        <boxGeometry args={[width * 0.62, 0.1, 0.34]} />
      </mesh>
    </group>
  );
}
