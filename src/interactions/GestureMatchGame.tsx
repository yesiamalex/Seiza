import { useEffect, useState } from "react";
import { GESTURES } from "../avatar/gestures";

interface GestureMatchGameProps {
  activeGesture: string | null;
  onRequestGesture: (gesture: string) => void;
}

/**
 * First pedagogical interaction module (paper Section 4). Shows a target
 * gesture prompt; the learner triggers gestures via onRequestGesture and
 * the game checks for a match. Deliberately the smallest useful case, not
 * the final interaction design — the paper's Section 4 still has open
 * questions about what else belongs here (scripted roleplay, scavenger
 * hunt, etc.).
 */
export function GestureMatchGame({ activeGesture, onRequestGesture }: GestureMatchGameProps) {
  const gestureNames = Object.keys(GESTURES);
  const [target, setTarget] = useState(() => pickRandom(gestureNames));
  const [score, setScore] = useState(0);

  useEffect(() => {
    if (activeGesture && activeGesture === target) {
      setScore((s) => s + 1);
      setTarget((prev) => pickRandom(gestureNames, prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGesture]);

  return (
    <div>
      <p>
        Do the gesture: <strong>{GESTURES[target]?.label ?? target}</strong> — score {score}
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        {gestureNames.map((g) => (
          <button key={g} onClick={() => onRequestGesture(g)}>
            {GESTURES[g].label}
          </button>
        ))}
      </div>
    </div>
  );
}

function pickRandom(list: string[], exclude?: string): string {
  const pool = exclude ? list.filter((x) => x !== exclude) : list;
  return pool[Math.floor(Math.random() * pool.length)] ?? list[0];
}
