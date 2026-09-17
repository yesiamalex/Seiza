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
export function SeatPad({ seat, onSit, occupied }: { seat: Seat; onSit: (seat: Seat) => void; occupied: boolean }) {
  const [hovered, setHovered] = useState(false);
  // Looking around is a drag with the same button, so a press that travels
  // is a look, not a request to sit.
  const pressRef = useRef<{ x: number; y: number } | null>(null);

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
      position={[seat.position[0], seat.position[1] + SEAT_HEIGHT + 0.06, seat.position[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
      userData={{ navIgnore: true }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onPointerDown={(event) => {
        pressRef.current = { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY };
      }}
      onPointerUp={(event) => {
        const press = pressRef.current;
        pressRef.current = null;
        if (!press) return;
        const travelled = Math.hypot(event.nativeEvent.clientX - press.x, event.nativeEvent.clientY - press.y);
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
