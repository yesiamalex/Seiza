import { Billboard } from "@react-three/drei";
import { VideoPanel } from "./VideoPanel";

interface CameraBadgeProps {
  stream: MediaStream | null;
  /** False when something else decided this one isn't worth decoding. */
  active?: boolean;
  /** Self-view mirrors, the way a webcam preview normally does. */
  mirrored?: boolean;
}

const WIDTH = 0.44;
const HEIGHT = 0.33;

/**
 * Someone's camera, on a small panel beside their head. Billboarded, so it
 * faces you from wherever you're standing, and it disappears at a distance
 * where it would be a few pixels wide anyway (see VideoPanel).
 */
export function CameraBadge({ stream, active = true, mirrored = false }: CameraBadgeProps) {
  if (!stream) return null;
  return (
    <Billboard position={[0.52, 1.5, 0]}>
      <mesh position={[0, 0, -0.008]}>
        <planeGeometry args={[WIDTH + 0.04, HEIGHT + 0.04]} />
        <meshBasicMaterial color="#12151c" transparent opacity={0.85} />
      </mesh>
      <VideoPanel stream={stream} width={WIDTH} height={HEIGHT} maxDistance={16} active={active} mirrored={mirrored} />
    </Billboard>
  );
}
