import { getWorldMaterials, type WorldMaterials } from "./materials";

/** A table's footprint and height, in metres: a meeting or classroom table
 *  that seats two a side, at the height the chairs are made for. */
export const TABLE = { width: 1.6, depth: 0.8, height: 0.74, top: 0.04 } as const;

/**
 * One table, placed in Edit Mode (src/edit/WorldObjects.tsx) or by a world's
 * defaults: a light top on a steel frame, the same materials as the chairs
 * it goes with. Local space: the long side runs along X.
 */
export function Table({ m = getWorldMaterials() }: { m?: WorldMaterials }) {
  const legX = TABLE.width / 2 - 0.08;
  const legZ = TABLE.depth / 2 - 0.08;
  const legH = TABLE.height - TABLE.top;
  return (
    <group>
      <mesh position={[0, TABLE.height - TABLE.top / 2, 0]} material={m.furnitureTop} castShadow receiveShadow>
        <boxGeometry args={[TABLE.width, TABLE.top, TABLE.depth]} />
      </mesh>
      {/* An apron under the top's edge, so it reads as a made table. */}
      <mesh position={[0, TABLE.height - TABLE.top - 0.04, 0]} material={m.metal}>
        <boxGeometry args={[TABLE.width - 0.12, 0.06, TABLE.depth - 0.12]} />
      </mesh>
      {[
        [-legX, -legZ],
        [legX, -legZ],
        [-legX, legZ],
        [legX, legZ],
      ].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, legH / 2, z]} material={m.metal} castShadow>
          <boxGeometry args={[0.05, legH, 0.05]} />
        </mesh>
      ))}
    </group>
  );
}
