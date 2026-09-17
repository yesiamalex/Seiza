import { getWorldMaterials, type WorldMaterials } from "./materials";
import { SEAT_HEIGHT } from "./layout";

/**
 * One chair, shared by the built-in classroom and by chairs players place
 * themselves in Edit Mode (src/edit/WorldObjects.tsx).
 *
 * It lives in its own file rather than in BaseEnvironment because both
 * callers have to agree on its proportions exactly: a placed chair's seat
 * is where a player's hips are put when they sit on it, so if the two ever
 * drifted apart, sitting would land somewhere that isn't the cushion.
 *
 * Local space matches the seat convention in layout.ts: the sitter faces
 * -Z, so the backrest is at +Z behind them.
 */
export function Chair({
  position = [0, 0, 0],
  rotationY = 0,
  m = getWorldMaterials(),
}: {
  position?: [number, number, number];
  rotationY?: number;
  m?: WorldMaterials;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, SEAT_HEIGHT, 0]} material={m.furnitureLight} castShadow receiveShadow>
        <boxGeometry args={[0.46, 0.07, 0.46]} />
      </mesh>
      {/* Behind the sitter, who faces -Z in local space and sits forward of
          this chair's own centre (see SEAT_FORWARD_OFFSET in layout.ts) —
          pushed back a little further and shortened so a coat or skirt,
          which doesn't fold the way real cloth would, has room to sit
          between the two without visibly poking through the backrest. */}
      <mesh position={[0, SEAT_HEIGHT + 0.28, 0.24]} rotation={[0.08, 0, 0]} material={m.furnitureLight} castShadow>
        <boxGeometry args={[0.44, 0.38, 0.06]} />
      </mesh>
      {[
        [-0.19, -0.19],
        [0.19, -0.19],
        [-0.19, 0.19],
        [0.19, 0.19],
      ].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, SEAT_HEIGHT / 2, z]} material={m.metal}>
          <boxGeometry args={[0.05, SEAT_HEIGHT, 0.05]} />
        </mesh>
      ))}
    </group>
  );
}
