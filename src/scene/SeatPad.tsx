import { useEffect, useRef, useState } from "react";
import { SEAT_HEIGHT, type Seat } from "./layout";

/**
 * Click target floating just above a seat. Invisible until hovered, so the
 * room isn't covered in markers, and flagged `navIgnore` so the navmesh
 * doesn't treat these discs as little platforms (see useNavMesh.ts).
 *
 * Shared by the built-in world's seats and by chairs players place
 * themselves, so sitting behaves identically on both.
 */
/** Screen coordinates for a pointer that has them (mouse, touch), and a
 *  flag saying so for one that doesn't (an XR controller ray). */
interface ScreenPoint {
  x: number;
  y: number;
  onScreen: boolean;
}

function screenPointOf(native: unknown): ScreenPoint {
  const point = native as { clientX?: number; clientY?: number };
  const onScreen = Number.isFinite(point?.clientX) && Number.isFinite(point?.clientY);
  return { x: point?.clientX ?? 0, y: point?.clientY ?? 0, onScreen };
}

export function SeatPad({ seat, onSit, occupied }: { seat: Seat; onSit: (seat: Seat) => void; occupied: boolean }) {
  const [hovered, setHovered] = useState(false);
  // Looking around is a drag with the same button, so a press that travels
  // is a look, not a request to sit.
  const pressRef = useRef<ScreenPoint | null>(null);

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  return (
    <mesh
      // Relative to the seat's own floor, not to y=0: the built-in seats all
      // stand on the ground, but a placed chair can sit on the tatami step
      // or be scaled, and the pad has to stay on its cushion either way.
      position={[seat.position[0], seat.position[1] + (seat.surfaceHeight ?? SEAT_HEIGHT) + 0.06, seat.position[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
      userData={{ navIgnore: true }}
      // Not drawn until it shows, which saves a draw call per seat (an
      // opacity of 0 is still drawn). Clicks and hovers still land on it:
      // raycasting doesn't skip invisible meshes.
      visible={hovered || occupied}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onPointerDown={(event) => {
        pressRef.current = screenPointOf(event.nativeEvent);
      }}
      onPointerUp={(event) => {
        const press = pressRef.current;
        pressRef.current = null;
        if (!press) return;
        // Distinguishing a click from a look-drag only means anything for
        // a pointer that lives on a screen. A VR controller's ray has no
        // screen coordinates at all, so there is no drag to measure and
        // the press is taken at face value.
        const here = screenPointOf(event.nativeEvent);
        const travelled = here && press.onScreen ? Math.hypot(here.x - press.x, here.y - press.y) : 0;
        if (travelled > 8) return;
        event.stopPropagation();
        onSit(seat);
      }}
    >
      <circleGeometry args={[0.28, 24]} />
      <meshBasicMaterial
        color={occupied ? "#7CFF9E" : "#ffd9a0"}
        transparent
        opacity={hovered ? 0.55 : occupied ? 0.3 : 0}
        depthWrite={false}
      />
    </mesh>
  );
}
