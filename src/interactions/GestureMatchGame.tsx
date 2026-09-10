import { useEffect, useState } from "react";
import { GESTURES } from "../avatar/gestures";
import { panelStyle, pillButtonStyle, popoverStyle } from "../ui/styles";
import { WaveIcon } from "../ui/icons";

interface GestureMatchGameProps {
  activeGesture: string | null;
  onRequestGesture: (gesture: string) => void;
  enabledGestures: string[];
}

/**
 * First pedagogical interaction module (paper Section 4). Shows a target
 * gesture prompt; the learner triggers gestures via onRequestGesture and
 * the game checks for a match. Deliberately the smallest useful case, not
 * the final interaction design — the paper's Section 4 still has open
 * questions about what else belongs here (scripted roleplay, scavenger
 * hunt, etc.).
 */
export function GestureMatchGame({ activeGesture, onRequestGesture, enabledGestures }: GestureMatchGameProps) {
  const [open, setOpen] = useState(false);
  const gestureNames = enabledGestures.filter((name) => name in GESTURES);
  const availableGestureNames = gestureNames.filter((name) => GESTURES[name].available);
  const [target, setTarget] = useState(() => pickRandom(availableGestureNames));
  const [score, setScore] = useState(0);

  useEffect(() => {
    if (activeGesture && activeGesture === target) {
      setScore((s) => s + 1);
      setTarget((prev) => pickRandom(availableGestureNames, prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGesture]);

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button style={pillButtonStyle} onClick={() => setOpen((v) => !v)}>
        <WaveIcon /> Gestures {score > 0 ? `(${score})` : ""}
      </button>
      {open && (
        <div className="seiza-popover" style={{ ...panelStyle, ...popoverStyle, display: "flex", flexDirection: "column", gap: 8, width: 260 }}>
          {availableGestureNames.length === 0 ? (
            <>
              <p style={{ margin: 0 }}>Gesture practice is not installed on this deployment.</p>
              <small style={{ opacity: 0.72 }}>Add licensed `.vrma` clips under `public/gestures/` and mark them available in `src/avatar/gestures.ts`.</small>
            </>
          ) : (
            <>
              <p style={{ margin: 0 }}>
                Do the gesture: <strong>{GESTURES[target]?.label ?? target}</strong> — score {score}
              </p>
              <small style={{ opacity: 0.72 }}>Choose the matching gesture to earn 1 point. The target changes after a correct match; gestures do not affect movement or permissions.</small>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {availableGestureNames.map((g) => (
                  <button key={g} style={pillButtonStyle} onClick={() => onRequestGesture(g)}>
                    {GESTURES[g].label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function pickRandom(list: string[], exclude?: string): string {
  const pool = exclude ? list.filter((x) => x !== exclude) : list;
  return pool[Math.floor(Math.random() * pool.length)] ?? list[0];
}
