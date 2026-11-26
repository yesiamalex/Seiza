import { useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";

/**
 * Inside the Canvas: draws at a little less of the screen's resolution
 * when the frame rate stays low (a crowd, a weak GPU), and back up when it
 * recovers. Never in a headset: there the frames come from the headset's
 * own loop, which a page's frame counter doesn't see, and the headset sets
 * its own resolution; changing the canvas mid-session resized the view and
 * squashed its panels.
 */
export function AdaptiveResolution({ onChange }: { onChange: (update: (r: number) => number) => void }) {
  const gl = useThree((s) => s.gl);
  const ok = () => !gl.xr.isPresenting;
  return (
    <PerformanceMonitor
      bounds={() => [40, 55]}
      flipflops={4}
      onDecline={() => ok() && onChange((r) => Math.max(0.5, Math.round((r - 0.15) * 100) / 100))}
      onIncline={() => ok() && onChange((r) => Math.min(1, Math.round((r + 0.1) * 100) / 100))}
      onFallback={() => ok() && onChange(() => 0.85)}
    />
  );
}
